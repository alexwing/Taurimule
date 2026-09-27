//! EC Protocol Packet — Frame-level serialization.
//!
//! Wire format:
//!   [4 bytes] Flags  (uint32 big-endian)
//!   [4 bytes] Length (uint32 big-endian, payload size)
//!   [payload]:
//!     [1 byte]  Opcode
//!     [2 bytes] Tag count (uint16 big-endian)
//!     [tags...]

use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::io::Cursor;

use super::opcodes::*;
use super::tags::EcTag;

/// An EC protocol packet (application layer).
#[derive(Debug, Clone)]
pub struct EcPacket {
    pub opcode: u8,
    pub tags: Vec<EcTag>,
}

impl EcPacket {
    /// Create a new packet with the given opcode.
    pub fn new(opcode: u8) -> Self {
        Self {
            opcode,
            tags: Vec::new(),
        }
    }

    /// Add a tag to the packet.
    pub fn add_tag(&mut self, tag: EcTag) {
        self.tags.push(tag);
    }

    /// Find a top-level tag by name.
    pub fn find_tag(&self, name: u16) -> Option<&EcTag> {
        self.tags.iter().find(|t| t.name == name)
    }

    /// Serialize the packet to a complete wire frame (flags + length + payload).
    pub fn to_bytes(&self, use_zlib: bool) -> Vec<u8> {
        // Build the payload: opcode + tag_count + tags
        let mut payload = Vec::new();
        payload.push(self.opcode);
        payload
            .write_u16::<BigEndian>(self.tags.len() as u16)
            .unwrap();
        for tag in &self.tags {
            tag.write_to(&mut payload);
        }

        // Optionally compress with zlib
        let (flags, final_payload) = if use_zlib {
            match compress_zlib(&payload) {
                Some(compressed) => (EC_FLAG_BASE | EC_FLAG_ZLIB, compressed),
                None => (EC_FLAG_BASE, payload),
            }
        } else {
            (EC_FLAG_BASE, payload)
        };

        // Build the frame: flags + length + payload
        let mut frame = Vec::with_capacity(8 + final_payload.len());
        frame.write_u32::<BigEndian>(flags).unwrap();
        frame
            .write_u32::<BigEndian>(final_payload.len() as u32)
            .unwrap();
        frame.extend_from_slice(&final_payload);
        frame
    }

    /// Deserialize a packet from raw payload bytes (after frame header is stripped).
    pub fn from_payload(data: &[u8]) -> Result<Self, String> {
        if data.is_empty() {
            return Err("Empty payload".to_string());
        }

        let mut cursor = Cursor::new(data);

        let opcode = cursor
            .read_u8()
            .map_err(|e| format!("Failed to read opcode: {}", e))?;

        let tag_count = cursor
            .read_u16::<BigEndian>()
            .map_err(|e| format!("Failed to read tag count: {}", e))? as usize;

        let mut tags = Vec::with_capacity(tag_count);
        for _ in 0..tag_count {
            let tag = EcTag::read_from(&mut cursor)?;
            tags.push(tag);
        }

        Ok(Self { opcode, tags })
    }
}

/// Compress data using raw zlib deflate.
fn compress_zlib(data: &[u8]) -> Option<Vec<u8>> {
    use flate2::write::ZlibEncoder;
    use flate2::Compression;
    use std::io::Write;

    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data).ok()?;
    encoder.finish().ok()
}

/// Decompress data using raw zlib inflate.
pub fn decompress_zlib(data: &[u8]) -> Result<Vec<u8>, String> {
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    let mut decoder = ZlibDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Zlib decompression failed: {}", e))?;
    Ok(decompressed)
}
