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

/// Maximum accepted size for a frame payload and for its decompressed form (10 MB).
pub const MAX_PACKET_SIZE: usize = 10 * 1024 * 1024;

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

    // Read one byte past the limit so an oversized stream is detected, not silently truncated.
    let mut decoder = ZlibDecoder::new(data).take(MAX_PACKET_SIZE as u64 + 1);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Zlib decompression failed: {}", e))?;
    if decompressed.len() > MAX_PACKET_SIZE {
        return Err(format!(
            "Decompressed EC packet exceeds {} bytes",
            MAX_PACKET_SIZE
        ));
    }
    Ok(decompressed)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Split a frame into (flags, payload), checking the declared length.
    fn split_frame(frame: &[u8]) -> Result<(u32, &[u8]), String> {
        if frame.len() < 8 {
            return Err("Truncated frame header".to_string());
        }
        let flags = u32::from_be_bytes(frame[0..4].try_into().unwrap());
        let len = u32::from_be_bytes(frame[4..8].try_into().unwrap()) as usize;
        let payload = &frame[8..];
        if len > payload.len() {
            return Err("Declared length exceeds available data".to_string());
        }
        Ok((flags, &payload[..len]))
    }

    fn decode_frame(frame: &[u8]) -> Result<EcPacket, String> {
        let (flags, payload) = split_frame(frame)?;
        if flags & EC_FLAG_ZLIB != 0 {
            EcPacket::from_payload(&decompress_zlib(payload)?)
        } else {
            EcPacket::from_payload(payload)
        }
    }

    fn sample() -> EcPacket {
        let mut p = EcPacket::new(EC_OP_AUTH_REQ);
        p.add_tag(EcTag::new_string(EC_TAG_AUTH_CLIENT_NAME, "Taurimule ñ"));
        p.add_tag(EcTag::new_u64(0x0200, 0x0102_0304_0506_0708));
        let mut parent = EcTag::new_empty(0x0300);
        parent.add_child(EcTag::new_hash16(0x0301, &[0xAB; 16]));
        p.add_tag(parent);
        p
    }

    fn assert_sample(p: &EcPacket) {
        assert_eq!(p.opcode, EC_OP_AUTH_REQ);
        assert_eq!(p.tags.len(), 3);
        assert_eq!(
            p.find_tag(EC_TAG_AUTH_CLIENT_NAME).unwrap().as_string().as_deref(),
            Some("Taurimule ñ")
        );
        assert_eq!(p.find_tag(0x0200).unwrap().as_u64(), Some(0x0102_0304_0506_0708));
        assert_eq!(
            p.find_tag(0x0300).unwrap().find_child(0x0301).unwrap().as_hash16(),
            Some([0xAB; 16])
        );
    }

    fn zlib(data: &[u8]) -> Vec<u8> {
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;
        let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
        e.write_all(data).unwrap();
        e.finish().unwrap()
    }

    #[test]
    fn round_trip_plain() {
        let frame = sample().to_bytes(false);
        let (flags, _) = split_frame(&frame).unwrap();
        assert_eq!(flags & EC_FLAG_ZLIB, 0);
        assert_sample(&decode_frame(&frame).unwrap());
    }

    #[test]
    fn round_trip_zlib() {
        let frame = sample().to_bytes(true);
        let (flags, _) = split_frame(&frame).unwrap();
        assert_ne!(flags & EC_FLAG_ZLIB, 0);
        assert_sample(&decode_frame(&frame).unwrap());
    }

    #[test]
    fn zlib_bomb_is_rejected() {
        let zeros = vec![0u8; MAX_PACKET_SIZE + 1024 * 1024];
        let compressed = zlib(&zeros);
        assert!(compressed.len() < 100 * 1024);
        assert!(decompress_zlib(&compressed).is_err());
    }

    #[test]
    fn zlib_at_limit_is_accepted() {
        let zeros = vec![0u8; MAX_PACKET_SIZE];
        assert_eq!(decompress_zlib(&zlib(&zeros)).unwrap().len(), MAX_PACKET_SIZE);
    }

    #[test]
    fn invalid_zlib_is_err() {
        assert!(decompress_zlib(&[1, 2, 3, 4, 5]).is_err());
    }

    #[test]
    fn truncated_frame_is_err_for_every_prefix() {
        let frame = sample().to_bytes(false);
        for len in 0..frame.len() {
            assert!(decode_frame(&frame[..len]).is_err(), "prefix of {} bytes should fail", len);
        }
    }

    #[test]
    fn declared_length_larger_than_data_is_err() {
        let mut frame = sample().to_bytes(false);
        frame[4..8].copy_from_slice(&0xFFFF_FFFFu32.to_be_bytes());
        assert!(decode_frame(&frame).is_err());
    }

    #[test]
    fn payload_with_more_tags_than_data_is_err() {
        // opcode + tag_count=0xFFFF, no tags
        assert!(EcPacket::from_payload(&[EC_OP_NOOP, 0xFF, 0xFF]).is_err());
        assert!(EcPacket::from_payload(&[]).is_err());
        assert!(EcPacket::from_payload(&[EC_OP_NOOP]).is_err());
    }
}
