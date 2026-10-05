//! EC Protocol TCP connection — Authentication, send/receive, and high-level operations.
//!
//! Implements the salted challenge-response authentication of aMule v3+:
//!   1. Client → EC_OP_AUTH_REQ (client info, protocol version)
//!   2. Server → EC_OP_AUTH_SALT (uint64 salt)
//!   3. Client → EC_OP_AUTH_PASSWD (MD5(MD5(password) + MD5(hex(salt))))
//!   4. Server → EC_OP_AUTH_OK / EC_OP_AUTH_FAIL

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::opcodes::*;
use super::packet::{self, EcPacket};
use super::tags::EcTag;
use super::types::*;

/// A live connection to an amuled daemon via the EC protocol.
pub struct EcConnection {
    stream: TcpStream,
    server_version: String,
    use_zlib: bool,
}

impl EcConnection {
    /// Connect to amuled and authenticate.
    pub async fn connect(host: &str, port: u16, password: &str) -> Result<Self, String> {
        let addr = format!("{}:{}", host, port);
        log::info!("Connecting to amuled EC at {}...", addr);

        let mut stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("TCP connect to {} failed: {}", addr, e))?;

        // Step 1: Send EC_OP_AUTH_REQ
        let mut auth_req = EcPacket::new(EC_OP_AUTH_REQ);
        auth_req.add_tag(EcTag::new_string(EC_TAG_CLIENT_NAME, "TauriMule"));
        auth_req.add_tag(EcTag::new_string(EC_TAG_CLIENT_VERSION, "0.2.0"));
        auth_req.add_tag(EcTag::new_u16(EC_TAG_PROTOCOL_VERSION, EC_PROTOCOL_VERSION));

        Self::send_raw(&mut stream, &auth_req, false).await?;

        // Step 2: Receive EC_OP_AUTH_SALT
        let salt_response = Self::recv_raw(&mut stream).await?;

        if salt_response.opcode == EC_OP_AUTH_FAIL {
            let msg = salt_response
                .find_tag(EC_TAG_STRING)
                .and_then(|t| t.as_string())
                .unwrap_or_else(|| "Unknown auth error".to_string());
            return Err(format!("Auth rejected: {}", msg));
        }

        if salt_response.opcode != EC_OP_AUTH_SALT {
            return Err(format!(
                "Expected EC_OP_AUTH_SALT (0x{:02X}), got 0x{:02X}",
                EC_OP_AUTH_SALT, salt_response.opcode
            ));
        }

        let salt = salt_response
            .find_tag(EC_TAG_PASSWD_SALT)
            .and_then(|t| t.as_u64())
            .ok_or_else(|| {
                format!(
                    "Missing salt in AUTH_SALT response. Received tags: {:?}",
                    salt_response.tags
                )
            })?;

        log::info!("Received auth salt: 0x{:X}", salt);

        // Step 3: Compute salted hash and send EC_OP_AUTH_PASSWD
        let final_hash = compute_salted_hash(password, salt);

        let mut auth_passwd = EcPacket::new(EC_OP_AUTH_PASSWD);
        auth_passwd.add_tag(EcTag::new_hash16(EC_TAG_PASSWD_HASH, &final_hash));

        Self::send_raw(&mut stream, &auth_passwd, false).await?;

        // Step 4: Receive EC_OP_AUTH_OK / EC_OP_AUTH_FAIL
        let auth_result = Self::recv_raw(&mut stream).await?;

        match auth_result.opcode {
            EC_OP_AUTH_OK => {
                let version = auth_result
                    .find_tag(EC_TAG_SERVER_VERSION)
                    .and_then(|t| t.as_string())
                    .unwrap_or_else(|| "unknown".to_string());
                log::info!("Authenticated successfully. Server version: {}", version);
                Ok(Self {
                    stream,
                    server_version: version,
                    use_zlib: false,
                })
            }
            EC_OP_AUTH_FAIL => {
                let msg = auth_result
                    .find_tag(EC_TAG_STRING)
                    .and_then(|t| t.as_string())
                    .unwrap_or_else(|| "Authentication failed".to_string());
                Err(format!("Authentication failed: {}", msg))
            }
            other => Err(format!("Unexpected auth response opcode: 0x{:02X}", other)),
        }
    }

    pub fn server_version(&self) -> &str {
        &self.server_version
    }

    // ═══════════════════════════════════════════════════════════════
    // Low-level send / receive
    // ═══════════════════════════════════════════════════════════════

    async fn send_raw(stream: &mut TcpStream, packet: &EcPacket, use_zlib: bool) -> Result<(), String> {
        let frame = packet.to_bytes(use_zlib);
        stream
            .write_all(&frame)
            .await
            .map_err(|e| format!("Failed to send EC packet: {}", e))?;
        stream
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;
        Ok(())
    }

    async fn recv_raw(stream: &mut TcpStream) -> Result<EcPacket, String> {
        // Read 8-byte frame header
        let mut header = [0u8; 8];
        stream
            .read_exact(&mut header)
            .await
            .map_err(|e| format!("Failed to read EC frame header: {}", e))?;

        let flags = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let length = u32::from_be_bytes([header[4], header[5], header[6], header[7]]) as usize;

        if length == 0 {
            return Err("Zero-length EC packet".to_string());
        }

        if length > 10 * 1024 * 1024 {
            return Err(format!("EC packet too large: {} bytes", length));
        }

        // Read payload
        let mut payload = vec![0u8; length];
        stream
            .read_exact(&mut payload)
            .await
            .map_err(|e| format!("Failed to read EC payload ({} bytes): {}", length, e))?;

        // Decompress if ZLIB flag is set
        let data = if flags & EC_FLAG_ZLIB != 0 {
            packet::decompress_zlib(&payload)?
        } else {
            payload
        };

        EcPacket::from_payload(&data)
    }

    /// Send a packet and receive the response.
    pub async fn request(&mut self, packet: &EcPacket) -> Result<EcPacket, String> {
        Self::send_raw(&mut self.stream, packet, self.use_zlib).await?;
        Self::recv_raw(&mut self.stream).await
    }

    // ═══════════════════════════════════════════════════════════════
    // High-level operations
    // ═══════════════════════════════════════════════════════════════

    /// Send shutdown command to amuled.
    pub async fn shutdown(&mut self) -> Result<(), String> {
        let pkt = EcPacket::new(EC_OP_SHUTDOWN);
        Self::send_raw(&mut self.stream, &pkt, self.use_zlib).await
    }

    /// Get global statistics.
    pub async fn get_stats(&mut self) -> Result<GlobalStats, String> {
        let mut pkt = EcPacket::new(EC_OP_STAT_REQ);
        pkt.add_tag(EcTag::new_u8(EC_TAG_DETAIL_LEVEL, EC_DETAIL_WEB));
        let resp = self.request(&pkt).await?;

        let mut stats = GlobalStats::default();

        if let Some(tag) = resp.find_tag(EC_TAG_STATS_DL_SPEED) {
            stats.download_speed = tag.as_u32().unwrap_or(0) as f64;
        }
        if let Some(tag) = resp.find_tag(EC_TAG_STATS_UL_SPEED) {
            stats.upload_speed = tag.as_u32().unwrap_or(0) as f64;
        }

        // Connection state is embedded in EC_TAG_CONNSTATE
        // aMule CEC_ConnState_Tag bit layout (src/ECSpecialCoreTags.cpp):
        //   0x01: IsConnectedED2K()
        //   0x02: serverconnect->IsConnecting()
        //   0x04: IsConnectedKad()
        //   0x08: Kademlia::IsFirewalled()
        //   0x10: Kademlia::IsRunning()
        if let Some(conn_tag) = resp.find_tag(EC_TAG_CONNSTATE) {
            let state = conn_tag.as_u8().unwrap_or(0);
            stats.ed2k_connected = (state & 0x01) != 0;
            let ed2k_connecting = (state & 0x02) != 0;
            stats.kad_connected = (state & 0x04) != 0;
            stats.kad_firewalled = (state & 0x08) != 0;

            if stats.ed2k_connected {
                // If connected, check child EC_TAG_ED2K_ID (0x0006)
                if let Some(id_tag) = conn_tag.children.iter().find(|t| t.name == EC_TAG_ED2K_ID) {
                    let id_val = id_tag.as_u32().unwrap_or(0);
                    // Standard eD2k rule: ID >= 16777216 is High ID, ID < 16777216 is Low ID
                    if id_val >= 16_777_216 {
                        stats.ed2k_id = "High".to_string();
                    } else {
                        stats.ed2k_id = "Low".to_string();
                    }
                } else {
                    stats.ed2k_id = "High".to_string();
                }
            } else if ed2k_connecting {
                stats.ed2k_id = "Connecting".to_string();
            } else {
                stats.ed2k_id = "Disconnected".to_string();
            }
        }

        let mut ed2k_users = 0u32;
        let mut kad_users = 0u32;
        let mut ed2k_files = 0u32;
        let mut kad_files = 0u32;

        if let Some(t) = resp.find_tag(EC_TAG_STATS_ED2K_USERS) {
            ed2k_users = t.as_u32().unwrap_or(0);
        }
        if let Some(t) = resp.find_tag(EC_TAG_STATS_KAD_USERS) {
            kad_users = t.as_u32().unwrap_or(0);
        }
        if let Some(t) = resp.find_tag(EC_TAG_STATS_ED2K_FILES) {
            ed2k_files = t.as_u32().unwrap_or(0);
        }
        if let Some(t) = resp.find_tag(EC_TAG_STATS_KAD_FILES) {
            kad_files = t.as_u32().unwrap_or(0);
        }

        stats.total_users = ed2k_users + kad_users;
        stats.total_files = ed2k_files + kad_files;

        Ok(stats)
    }

    /// Get the list of ED2K servers.
    pub async fn get_server_list(&mut self) -> Result<Vec<ServerInfo>, String> {
        let mut pkt = EcPacket::new(EC_OP_GET_SERVER_LIST);
        pkt.add_tag(EcTag::new_u8(EC_TAG_DETAIL_LEVEL, EC_DETAIL_WEB));
        let resp = self.request(&pkt).await?;

        let mut servers = Vec::new();
        for tag in &resp.tags {
            if tag.name == EC_TAG_SERVER {
                let name = tag
                    .find_child(EC_TAG_SERVER_NAME)
                    .and_then(|t| t.as_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                let (ip, port) = if tag.data.len() >= 6 {
                    let ip_str = format!("{}.{}.{}.{}", tag.data[0], tag.data[1], tag.data[2], tag.data[3]);
                    let port_val = u16::from_be_bytes([tag.data[4], tag.data[5]]);
                    (ip_str, port_val)
                } else {
                    let ip_str = tag
                        .find_child(EC_TAG_SERVER_IP)
                        .and_then(|t| {
                            t.as_u32().map(|v| {
                                let bytes = v.to_be_bytes();
                                format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
                            })
                        })
                        .or_else(|| {
                            if tag.data.len() >= 4 {
                                Some(format!("{}.{}.{}.{}", tag.data[0], tag.data[1], tag.data[2], tag.data[3]))
                            } else {
                                None
                            }
                        })
                        .unwrap_or_else(|| "0.0.0.0".to_string());
                    let port_val = tag
                        .find_child(EC_TAG_SERVER_PORT)
                        .and_then(|t| t.as_u16())
                        .unwrap_or(0);
                    (ip_str, port_val)
                };
                let users = tag
                    .find_child(EC_TAG_SERVER_USERS)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);
                let files = tag
                    .find_child(EC_TAG_SERVER_FILES)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);

                servers.push(ServerInfo {
                    name,
                    ip,
                    port,
                    users,
                    files,
                    is_connected: false, // Will be cross-referenced with stats
                });
            }
        }

        Ok(servers)
    }

    /// Connect to an ED2K server.
    pub async fn connect_server(&mut self, ip: &str, port: u16) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_SERVER_CONNECT);
        // Build IPv4 tag
        let parts: Vec<u8> = ip
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect();
        if parts.len() == 4 {
            let ip_u32 = u32::from_be_bytes([parts[0], parts[1], parts[2], parts[3]]);
            let mut server_tag = EcTag::new_u32(EC_TAG_SERVER, ip_u32);
            server_tag.add_child(EcTag::new_u16(EC_TAG_SERVER_PORT, port));
            pkt.add_tag(server_tag);
        }
        self.request(&pkt).await?;
        Ok(())
    }

    /// Disconnect from current ED2K server.
    pub async fn disconnect_server(&mut self) -> Result<(), String> {
        let pkt = EcPacket::new(EC_OP_SERVER_DISCONNECT);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Add a new ED2K server.
    pub async fn add_server(&mut self, ip: &str, port: u16, name: &str) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_SERVER_ADD);
        let parts: Vec<u8> = ip.split('.').map(|p| p.parse().unwrap_or(0)).collect();
        if parts.len() == 4 {
            let ip_u32 = u32::from_be_bytes([parts[0], parts[1], parts[2], parts[3]]);
            let mut server_tag = EcTag::new_u32(EC_TAG_SERVER, ip_u32);
            server_tag.add_child(EcTag::new_u16(EC_TAG_SERVER_PORT, port));
            server_tag.add_child(EcTag::new_string(EC_TAG_SERVER_NAME, name));
            pkt.add_tag(server_tag);
        }
        self.request(&pkt).await?;
        Ok(())
    }

    /// Remove an ED2K server.
    pub async fn remove_server(&mut self, ip: &str, port: u16) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_SERVER_REMOVE);
        let parts: Vec<u8> = ip.split('.').map(|p| p.parse().unwrap_or(0)).collect();
        if parts.len() == 4 {
            let ip_u32 = u32::from_be_bytes([parts[0], parts[1], parts[2], parts[3]]);
            let mut server_tag = EcTag::new_u32(EC_TAG_SERVER, ip_u32);
            server_tag.add_child(EcTag::new_u16(EC_TAG_SERVER_PORT, port));
            pkt.add_tag(server_tag);
        }
        self.request(&pkt).await?;
        Ok(())
    }

    /// Update server.met list from URL.
    pub async fn update_servers_from_url(&mut self, url: &str) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_SERVER_UPDATE_FROM_URL);
        pkt.add_tag(EcTag::new_string(EC_TAG_STRING, url));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Start Kademlia network.
    pub async fn start_kad(&mut self) -> Result<(), String> {
        let pkt = EcPacket::new(EC_OP_KAD_START);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Stop Kademlia network.
    pub async fn stop_kad(&mut self) -> Result<(), String> {
        let pkt = EcPacket::new(EC_OP_KAD_STOP);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Update / Bootstrap Kademlia contacts (nodes.dat) from URL.
    pub async fn bootstrap_kad_from_url(&mut self, url: &str) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_KAD_UPDATE_FROM_URL);
        pkt.add_tag(EcTag::new_string(EC_TAG_STRING, url));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Start a search.
    pub async fn search_start(&mut self, params: &SearchParams) -> Result<(), String> {
        let mut search_tag = EcTag::new_u8(EC_TAG_SEARCH_TYPE, params.search_type.to_ec_value());
        search_tag.add_child(EcTag::new_string(EC_TAG_SEARCH_NAME, &params.query));

        if let Some(ref ft) = params.file_type {
            search_tag.add_child(EcTag::new_string(EC_TAG_SEARCH_FILE_TYPE, ft));
        }
        if let Some(min) = params.min_size {
            search_tag.add_child(EcTag::new_u64(EC_TAG_SEARCH_MIN_SIZE, min));
        }
        if let Some(max) = params.max_size {
            search_tag.add_child(EcTag::new_u64(EC_TAG_SEARCH_MAX_SIZE, max));
        }

        let mut pkt = EcPacket::new(EC_OP_SEARCH_START);
        pkt.add_tag(search_tag);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Fetch search results.
    pub async fn search_results(&mut self) -> Result<Vec<SearchResult>, String> {
        let mut pkt = EcPacket::new(EC_OP_SEARCH_RESULTS);
        pkt.add_tag(EcTag::new_u8(EC_TAG_DETAIL_LEVEL, EC_DETAIL_FULL));
        let resp = self.request(&pkt).await?;

        let mut results = Vec::new();
        for tag in &resp.tags {
            if tag.name == EC_TAG_SEARCHFILE {
                let hash = tag
                    .find_child(EC_TAG_PARTFILE_HASH)
                    .and_then(|t| t.hash_hex())
                    .or_else(|| tag.hash_hex())
                    .unwrap_or_default();
                let name = tag
                    .find_child(EC_TAG_PARTFILE_NAME)
                    .or_else(|| tag.find_child(EC_TAG_SEARCH_NAME))
                    .and_then(|t| t.as_string())
                    .unwrap_or_default();
                let size = tag
                    .find_child(EC_TAG_PARTFILE_SIZE_FULL)
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0);
                let sources = tag
                    .find_child(EC_TAG_PARTFILE_SOURCE_COUNT)
                    .or_else(|| tag.find_child(EC_TAG_SEARCH_AVAILABILITY))
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);
                let complete = tag
                    .find_child(EC_TAG_PARTFILE_SOURCE_COUNT_XFER)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);

                let ft = guess_file_type_from_name(&name);

                results.push(SearchResult {
                    hash,
                    name,
                    size,
                    sources,
                    complete_sources: complete,
                    file_type: ft,
                });
            }
        }

        Ok(results)
    }

    /// Stop an active search.
    pub async fn search_stop(&mut self) -> Result<(), String> {
        let pkt = EcPacket::new(EC_OP_SEARCH_STOP);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Download a file from search results by hash.
    pub async fn download_search_result(&mut self, hash_hex: &str) -> Result<(), String> {
        let hash_bytes = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_DOWNLOAD_SEARCH_RESULT);
        let mut file_tag = EcTag::new_hash16(EC_TAG_PARTFILE, &hash_bytes);
        file_tag.add_child(EcTag::new_u8(EC_TAG_PARTFILE_CAT, 0));
        pkt.add_tag(file_tag);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Add an ED2K link directly to the download queue.
    pub async fn add_ed2k_link(&mut self, link: &str) -> Result<(), String> {
        let mut pkt = EcPacket::new(EC_OP_ADD_LINK);
        pkt.add_tag(EcTag::new_string(EC_TAG_STRING, link));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Get the download queue.
    pub async fn get_download_queue(&mut self) -> Result<Vec<DownloadInfo>, String> {
        let mut pkt = EcPacket::new(EC_OP_GET_DLOAD_QUEUE);
        pkt.add_tag(EcTag::new_u8(EC_TAG_DETAIL_LEVEL, EC_DETAIL_WEB));
        let resp = self.request(&pkt).await?;

        let mut downloads = Vec::new();
        for tag in &resp.tags {
            if tag.name == EC_TAG_PARTFILE {
                let hash = tag
                    .find_child(EC_TAG_PARTFILE_HASH)
                    .and_then(|t| t.hash_hex())
                    .or_else(|| tag.hash_hex())
                    .unwrap_or_default();
                let name = tag
                    .find_child(EC_TAG_PARTFILE_NAME)
                    .and_then(|t| t.as_string())
                    .unwrap_or_default();
                let size_total = tag
                    .find_child(EC_TAG_PARTFILE_SIZE_FULL)
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0);
                let size_done = tag
                    .find_child(EC_TAG_PARTFILE_SIZE_DONE)
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0);
                let speed = tag
                    .find_child(EC_TAG_PARTFILE_SPEED)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0) as f64;
                let status_val = tag
                    .find_child(EC_TAG_PARTFILE_STATUS)
                    .and_then(|t| t.as_u8())
                    .unwrap_or(0);
                let prio_val = tag
                    .find_child(EC_TAG_PARTFILE_PRIO)
                    .and_then(|t| t.as_u8())
                    .unwrap_or(1);
                let sources_total = tag
                    .find_child(EC_TAG_PARTFILE_SOURCE_COUNT)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);
                let sources_xfer = tag
                    .find_child(EC_TAG_PARTFILE_SOURCE_COUNT_XFER)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0);

                let progress = if size_total > 0 {
                    size_done as f64 / size_total as f64
                } else {
                    0.0
                };

                let eta = if speed > 0.0 && size_total > size_done {
                    Some(((size_total - size_done) as f64 / speed) as u64)
                } else {
                    None
                };

                downloads.push(DownloadInfo {
                    hash,
                    name,
                    size_total,
                    size_done,
                    progress,
                    speed,
                    sources_total,
                    sources_transferring: sources_xfer,
                    priority: DownloadPriority::from_u8(prio_val).label().to_string(),
                    status: DownloadStatus::from_u8(status_val).label().to_string(),
                    eta_seconds: eta,
                });
            }
        }

        Ok(downloads)
    }

    /// Pause a download by hash.
    pub async fn pause_download(&mut self, hash_hex: &str) -> Result<(), String> {
        let hash = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_PARTFILE_PAUSE);
        pkt.add_tag(EcTag::new_hash16(EC_TAG_PARTFILE, &hash));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Resume a download by hash.
    pub async fn resume_download(&mut self, hash_hex: &str) -> Result<(), String> {
        let hash = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_PARTFILE_RESUME);
        pkt.add_tag(EcTag::new_hash16(EC_TAG_PARTFILE, &hash));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Delete a download by hash.
    pub async fn delete_download(&mut self, hash_hex: &str) -> Result<(), String> {
        let hash = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_PARTFILE_DELETE);
        pkt.add_tag(EcTag::new_hash16(EC_TAG_PARTFILE, &hash));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Request more sources / swap A4AF sources to this download.
    pub async fn request_more_sources(&mut self, hash_hex: &str) -> Result<(), String> {
        let hash = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_PARTFILE_SWAP_A4AF_THIS);
        pkt.add_tag(EcTag::new_hash16(EC_TAG_PARTFILE, &hash));
        self.request(&pkt).await?;
        Ok(())
    }

    /// Set download priority.
    pub async fn set_download_priority(
        &mut self,
        hash_hex: &str,
        priority: u8,
    ) -> Result<(), String> {
        let hash = hex_to_hash16(hash_hex)?;
        let mut pkt = EcPacket::new(EC_OP_PARTFILE_PRIO_SET);
        let mut file_tag = EcTag::new_hash16(EC_TAG_PARTFILE, &hash);
        file_tag.add_child(EcTag::new_u8(EC_TAG_PARTFILE_PRIO, priority));
        pkt.add_tag(file_tag);
        self.request(&pkt).await?;
        Ok(())
    }

    /// Get the upload queue.
    pub async fn get_upload_queue(&mut self) -> Result<Vec<UploadInfo>, String> {
        let mut pkt = EcPacket::new(EC_OP_GET_ULOAD_QUEUE);
        pkt.add_tag(EcTag::new_u8(EC_TAG_DETAIL_LEVEL, EC_DETAIL_WEB));
        let resp = self.request(&pkt).await?;

        let mut uploads = Vec::new();
        for tag in &resp.tags {
            if tag.name == EC_TAG_CLIENT {
                let hash = tag.hash_hex().unwrap_or_default();
                let client_name = tag
                    .find_child(EC_TAG_CLIENT_NAME)
                    .and_then(|t| t.as_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                let speed = tag
                    .find_child(EC_TAG_CLIENT_UP_SPEED)
                    .and_then(|t| t.as_u32())
                    .unwrap_or(0) as f64;
                let transferred = tag
                    .find_child(EC_TAG_CLIENT_UPLOAD_TOTAL)
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0);
                let file_name = tag
                    .find_child(EC_TAG_CLIENT_UPLOAD_FILE)
                    .or_else(|| tag.find_child(EC_TAG_CLIENT_REMOTE_FILENAME))
                    .and_then(|t| t.as_string())
                    .unwrap_or_default();

                uploads.push(UploadInfo {
                    hash,
                    name: file_name,
                    speed,
                    client_name,
                    transferred,
                });
            }
        }

        Ok(uploads)
    }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/// Compute the salted authentication hash.
///
/// Algorithm (aMule v3+):
///   1. user_hash = MD5(password).to_hex_lowercase()
///   2. salt_hex  = format!("{:X}", salt)  (uppercase hex)
///   3. salt_hash = MD5(salt_hex).to_hex_lowercase()
///   4. final     = MD5(user_hash + salt_hash) → 16 raw bytes
fn compute_salted_hash(password: &str, salt: u64) -> [u8; 16] {
    let user_hash = format!("{:x}", md5::compute(password.as_bytes()));
    let salt_hex = format!("{:X}", salt);
    let salt_hash = format!("{:x}", md5::compute(salt_hex.as_bytes()));
    let combined = format!("{}{}", user_hash, salt_hash);
    let digest = md5::compute(combined.as_bytes());
    digest.0
}

/// Convert a hex string to a 16-byte hash.
fn hex_to_hash16(hex: &str) -> Result<[u8; 16], String> {
    let clean = hex.trim();
    if clean.len() != 32 {
        return Err(format!(
            "Invalid hash length: expected 32 hex chars, got {}",
            clean.len()
        ));
    }
    let mut hash = [0u8; 16];
    for i in 0..16 {
        hash[i] = u8::from_str_radix(&clean[i * 2..i * 2 + 2], 16)
            .map_err(|e| format!("Invalid hex at position {}: {}", i * 2, e))?;
    }
    Ok(hash)
}

/// Guess file type from extension (for search results).
fn guess_file_type_from_name(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".mp3")
        || lower.ends_with(".flac")
        || lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".aac")
    {
        "Audio".to_string()
    } else if lower.ends_with(".avi")
        || lower.ends_with(".mkv")
        || lower.ends_with(".mp4")
        || lower.ends_with(".wmv")
        || lower.ends_with(".mov")
    {
        "Video".to_string()
    } else if lower.ends_with(".zip")
        || lower.ends_with(".rar")
        || lower.ends_with(".7z")
        || lower.ends_with(".tar")
        || lower.ends_with(".gz")
    {
        "Archive".to_string()
    } else if lower.ends_with(".iso") || lower.ends_with(".img") || lower.ends_with(".bin") {
        "CD-Image".to_string()
    } else if lower.ends_with(".pdf")
        || lower.ends_with(".doc")
        || lower.ends_with(".txt")
        || lower.ends_with(".epub")
    {
        "Doc".to_string()
    } else if lower.ends_with(".jpg")
        || lower.ends_with(".png")
        || lower.ends_with(".gif")
        || lower.ends_with(".bmp")
    {
        "Image".to_string()
    } else if lower.ends_with(".exe") || lower.ends_with(".msi") || lower.ends_with(".dmg") {
        "Program".to_string()
    } else {
        "Other".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_inspect_kad_tags() {
        match EcConnection::connect("127.0.0.1", 4712, "taurimule").await {
            Ok(mut conn) => {
                let stats = conn.get_stats().await.expect("get_stats failed");
                println!("PARSED GLOBAL STATS: {:?}", stats);
                assert!(stats.ed2k_connected);
                assert!(stats.kad_connected);
            }
            Err(e) => {
                println!("Could not connect: {}", e);
            }
        }
    }
}



