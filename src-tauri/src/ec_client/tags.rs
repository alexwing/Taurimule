//! EC Protocol Tag system — Binary TLV (Type-Length-Value) encoding/decoding.
//!
//! Each tag on the wire:
//!   [2 bytes] TMP_TAGNAME  (uint16 big-endian, name<<1 | has_children)
//!   [1 byte]  TAGTYPE      (uint8)
//!   [4 bytes] TAGLEN       (uint32 big-endian, total child+data bytes)
//!   [2 bytes] CHILD_COUNT  (uint16 big-endian, ONLY if has_children)
//!   ...children tags...
//!   ...raw data bytes...

use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::io::{Cursor, Read, Write};

use super::opcodes::*;

/// Maximum nesting depth accepted when parsing tags (guards against stack exhaustion).
pub const MAX_TAG_DEPTH: usize = 16;

/// A single EC protocol tag with optional children.
#[derive(Debug, Clone)]
pub struct EcTag {
    pub name: u16,
    pub tag_type: u8,
    pub data: Vec<u8>,
    pub children: Vec<EcTag>,
}

impl EcTag {
    // ───────────────── Constructors ─────────────────

    /// Create a tag with no data (container/flag tag).
    pub fn new_empty(name: u16) -> Self {
        Self {
            name,
            tag_type: EC_TAGTYPE_UNKNOWN,
            data: Vec::new(),
            children: Vec::new(),
        }
    }

    /// Create a uint8 tag.
    pub fn new_u8(name: u16, value: u8) -> Self {
        Self {
            name,
            tag_type: EC_TAGTYPE_UINT8,
            data: vec![value],
            children: Vec::new(),
        }
    }

    /// Create a uint16 tag (big-endian).
    pub fn new_u16(name: u16, value: u16) -> Self {
        let mut data = Vec::with_capacity(2);
        data.write_u16::<BigEndian>(value).unwrap();
        Self {
            name,
            tag_type: EC_TAGTYPE_UINT16,
            data,
            children: Vec::new(),
        }
    }

    /// Create a uint32 tag (big-endian).
    pub fn new_u32(name: u16, value: u32) -> Self {
        let mut data = Vec::with_capacity(4);
        data.write_u32::<BigEndian>(value).unwrap();
        Self {
            name,
            tag_type: EC_TAGTYPE_UINT32,
            data,
            children: Vec::new(),
        }
    }

    /// Create a uint64 tag (big-endian).
    pub fn new_u64(name: u16, value: u64) -> Self {
        let mut data = Vec::with_capacity(8);
        data.write_u64::<BigEndian>(value).unwrap();
        Self {
            name,
            tag_type: EC_TAGTYPE_UINT64,
            data,
            children: Vec::new(),
        }
    }

    /// Create a UTF-8 string tag (null-terminated).
    pub fn new_string(name: u16, value: &str) -> Self {
        let mut data = value.as_bytes().to_vec();
        data.push(0); // null terminator
        Self {
            name,
            tag_type: EC_TAGTYPE_STRING,
            data,
            children: Vec::new(),
        }
    }

    /// Create a 16-byte hash tag (MD4/MD5).
    pub fn new_hash16(name: u16, hash: &[u8; 16]) -> Self {
        Self {
            name,
            tag_type: EC_TAGTYPE_HASH16,
            data: hash.to_vec(),
            children: Vec::new(),
        }
    }

    /// Create a raw custom data tag.
    pub fn new_custom(name: u16, data: Vec<u8>) -> Self {
        Self {
            name,
            tag_type: EC_TAGTYPE_CUSTOM,
            data,
            children: Vec::new(),
        }
    }

    /// Add a child tag.
    pub fn add_child(&mut self, child: EcTag) {
        self.children.push(child);
    }

    // ───────────────── Value Getters ─────────────────

    pub fn as_u8(&self) -> Option<u8> {
        if !self.data.is_empty() {
            Some(self.data[0])
        } else {
            None
        }
    }

    pub fn as_u16(&self) -> Option<u16> {
        if self.data.len() >= 2 {
            let mut cursor = Cursor::new(&self.data);
            cursor.read_u16::<BigEndian>().ok()
        } else {
            None
        }
    }

    pub fn as_u32(&self) -> Option<u32> {
        if self.data.len() >= 4 {
            let mut cursor = Cursor::new(&self.data);
            cursor.read_u32::<BigEndian>().ok()
        } else {
            // Smaller types auto-promote
            self.as_u16().map(|v| v as u32).or_else(|| self.as_u8().map(|v| v as u32))
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        if self.data.len() >= 8 {
            let mut cursor = Cursor::new(&self.data);
            cursor.read_u64::<BigEndian>().ok()
        } else {
            self.as_u32().map(|v| v as u64)
        }
    }

    pub fn as_string(&self) -> Option<String> {
        if self.tag_type == EC_TAGTYPE_STRING && !self.data.is_empty() {
            // Strip null terminator if present
            let end = if self.data.last() == Some(&0) {
                self.data.len() - 1
            } else {
                self.data.len()
            };
            String::from_utf8(self.data[..end].to_vec()).ok()
        } else {
            None
        }
    }

    pub fn as_hash16(&self) -> Option<[u8; 16]> {
        if self.data.len() >= 16 {
            let mut hash = [0u8; 16];
            hash.copy_from_slice(&self.data[..16]);
            Some(hash)
        } else {
            None
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        if self.tag_type == EC_TAGTYPE_DOUBLE {
            // EC doubles are encoded as ASCII strings
            self.as_string().and_then(|s| s.parse::<f64>().ok())
        } else {
            self.as_u64().map(|v| v as f64)
        }
    }

    /// Find a child tag by name.
    pub fn find_child(&self, name: u16) -> Option<&EcTag> {
        self.children.iter().find(|t| t.name == name)
    }

    /// Hash as hex string (for display).
    pub fn hash_hex(&self) -> Option<String> {
        self.as_hash16()
            .map(|h| h.iter().map(|b| format!("{:02x}", b)).collect())
    }

    // ───────────────── Serialization ─────────────────

    /// Calculate the total wire size of this tag's data + children (excluding own 7-byte header and own 2-byte child count).
    fn data_len(&self) -> u32 {
        let children_size: u32 = self.children.iter().map(|c| c.wire_size()).sum();
        children_size + self.data.len() as u32
    }

    /// Total size of this tag on the wire (header + optional child count + data + children).
    pub fn wire_size(&self) -> u32 {
        let child_count_field: u32 = if !self.children.is_empty() { 2 } else { 0 };
        7 + child_count_field + self.data_len()
    }

    /// Serialize this tag to a byte buffer.
    pub fn write_to(&self, buf: &mut Vec<u8>) {
        let has_children = !self.children.is_empty();

        // TMP_TAGNAME: (name << 1) | has_children
        let tmp_name: u16 = (self.name << 1) | (if has_children { 1 } else { 0 });
        buf.write_u16::<BigEndian>(tmp_name).unwrap();

        // TAGTYPE
        buf.push(self.tag_type);

        // TAGLEN
        buf.write_u32::<BigEndian>(self.data_len()).unwrap();

        // CHILD_COUNT (only if has children)
        if has_children {
            buf.write_u16::<BigEndian>(self.children.len() as u16).unwrap();
            for child in &self.children {
                child.write_to(buf);
            }
        }

        // Raw data
        buf.write_all(&self.data).unwrap();
    }

    /// Deserialize a tag from a byte buffer.
    pub fn read_from(cursor: &mut Cursor<&[u8]>) -> Result<Self, String> {
        Self::read_from_depth(cursor, 0)
    }

    fn read_from_depth(cursor: &mut Cursor<&[u8]>, depth: usize) -> Result<Self, String> {
        if depth >= MAX_TAG_DEPTH {
            return Err(format!("Tag nesting too deep (max {})", MAX_TAG_DEPTH));
        }

        let tmp_name = cursor
            .read_u16::<BigEndian>()
            .map_err(|e| format!("Failed to read tag name: {}", e))?;

        let has_children = (tmp_name & 1) != 0;
        let name = tmp_name >> 1;

        let tag_type = cursor
            .read_u8()
            .map_err(|e| format!("Failed to read tag type: {}", e))?;

        let tag_len = cursor
            .read_u32::<BigEndian>()
            .map_err(|e| format!("Failed to read tag length: {}", e))? as usize;

        let mut children = Vec::new();
        let mut children_total_size: usize = 0;

        if has_children {
            let child_count = cursor
                .read_u16::<BigEndian>()
                .map_err(|e| format!("Failed to read child count: {}", e))? as usize;

            // TAGLEN covers children + own data, all of which must still be in the buffer.
            if tag_len > remaining(cursor) {
                return Err(format!(
                    "Tag length {} exceeds remaining {} bytes",
                    tag_len,
                    remaining(cursor)
                ));
            }

            for _ in 0..child_count {
                let start_pos = cursor.position();
                let child = EcTag::read_from_depth(cursor, depth + 1)?;
                children_total_size += (cursor.position() - start_pos) as usize;
                children.push(child);
            }
        }

        // Remaining bytes are the tag's own data
        let data_size = tag_len.saturating_sub(children_total_size);
        if data_size > remaining(cursor) {
            return Err(format!(
                "Tag data length {} exceeds remaining {} bytes",
                data_size,
                remaining(cursor)
            ));
        }
        let mut data = vec![0u8; data_size];
        cursor
            .read_exact(&mut data)
            .map_err(|e| format!("Failed to read tag data ({} bytes): {}", data_size, e))?;

        Ok(Self {
            name,
            tag_type,
            data,
            children,
        })
    }
}

/// Bytes left to read in the cursor's buffer.
fn remaining(cursor: &Cursor<&[u8]>) -> usize {
    cursor
        .get_ref()
        .len()
        .saturating_sub(cursor.position() as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(tag: &EcTag) -> Vec<u8> {
        let mut buf = Vec::new();
        tag.write_to(&mut buf);
        buf
    }

    fn decode(bytes: &[u8]) -> Result<EcTag, String> {
        EcTag::read_from(&mut Cursor::new(bytes))
    }

    fn assert_same(a: &EcTag, b: &EcTag) {
        assert_eq!(a.name, b.name);
        assert_eq!(a.tag_type, b.tag_type);
        assert_eq!(a.data, b.data);
        assert_eq!(a.children.len(), b.children.len());
        for (x, y) in a.children.iter().zip(&b.children) {
            assert_same(x, y);
        }
    }

    fn round_trip(tag: &EcTag) -> EcTag {
        let bytes = encode(tag);
        assert_eq!(bytes.len(), tag.wire_size() as usize);
        let back = decode(&bytes).expect("round-trip decode");
        assert_same(tag, &back);
        back
    }

    /// Chain of `levels` nested tags (a single leaf at the bottom).
    fn nested(levels: usize) -> EcTag {
        let mut tag = EcTag::new_u8(1, 7);
        for _ in 1..levels {
            let mut parent = EcTag::new_empty(1);
            parent.add_child(tag);
            tag = parent;
        }
        tag
    }

    #[test]
    fn round_trip_integers() {
        assert_eq!(round_trip(&EcTag::new_u8(0x10, 0xAB)).as_u8(), Some(0xAB));
        assert_eq!(round_trip(&EcTag::new_u16(0x11, 0xBEEF)).as_u16(), Some(0xBEEF));
        assert_eq!(round_trip(&EcTag::new_u32(0x12, 0xDEAD_BEEF)).as_u32(), Some(0xDEAD_BEEF));
        assert_eq!(
            round_trip(&EcTag::new_u64(0x13, 0x0123_4567_89AB_CDEF)).as_u64(),
            Some(0x0123_4567_89AB_CDEF)
        );
    }

    #[test]
    fn round_trip_strings() {
        assert_eq!(round_trip(&EcTag::new_string(0x20, "hola")).as_string().as_deref(), Some("hola"));
        assert_eq!(round_trip(&EcTag::new_string(0x21, "ñ日本")).as_string().as_deref(), Some("ñ日本"));
        assert_eq!(round_trip(&EcTag::new_string(0x22, "")).as_string().as_deref(), Some(""));
    }

    #[test]
    fn round_trip_hash16() {
        let hash: [u8; 16] = core::array::from_fn(|i| i as u8 * 17);
        assert_eq!(round_trip(&EcTag::new_hash16(0x30, &hash)).as_hash16(), Some(hash));
    }

    #[test]
    fn round_trip_two_level_children() {
        let mut grandchild = EcTag::new_string(0x43, "nieto");
        grandchild.add_child(EcTag::new_u8(0x44, 1));
        let mut child = EcTag::new_u32(0x41, 99);
        child.add_child(grandchild);
        child.add_child(EcTag::new_hash16(0x42, &[9u8; 16]));
        let mut root = EcTag::new_string(0x40, "raíz");
        root.add_child(child);
        root.add_child(EcTag::new_u16(0x45, 5));

        let back = round_trip(&root);
        assert_eq!(back.as_string().as_deref(), Some("raíz"));
        let child = back.find_child(0x41).unwrap();
        assert_eq!(child.as_u32(), Some(99));
        assert_eq!(child.find_child(0x43).unwrap().as_string().as_deref(), Some("nieto"));
        assert_eq!(child.find_child(0x43).unwrap().find_child(0x44).unwrap().as_u8(), Some(1));
    }

    #[test]
    fn truncated_buffer_is_err_for_every_prefix() {
        let mut child = EcTag::new_string(0x51, "ñ日本");
        child.add_child(EcTag::new_u16(0x52, 7));
        let mut root = EcTag::new_u32(0x50, 1234);
        root.add_child(child);
        root.add_child(EcTag::new_hash16(0x53, &[3u8; 16]));
        let bytes = encode(&root);

        for len in 0..bytes.len() {
            assert!(decode(&bytes[..len]).is_err(), "prefix of {} bytes should fail", len);
        }
        assert!(decode(&bytes).is_ok());
    }

    #[test]
    fn absurd_length_is_err() {
        // name=1 (no children), type=UINT8, len=0xFFFFFFFF, then 4 real bytes
        let mut bytes = vec![0x00, 0x02, EC_TAGTYPE_UINT8];
        bytes.extend_from_slice(&0xFFFF_FFFFu32.to_be_bytes());
        bytes.extend_from_slice(&[1, 2, 3, 4]);
        assert!(decode(&bytes).is_err());

        // Same with the has_children bit and a child count
        let mut bytes = vec![0x00, 0x03, EC_TAGTYPE_UINT8];
        bytes.extend_from_slice(&0xFFFF_FFFFu32.to_be_bytes());
        bytes.extend_from_slice(&[0xFF, 0xFF, 1, 2, 3, 4]);
        assert!(decode(&bytes).is_err());
    }

    #[test]
    fn nesting_depth_is_limited() {
        assert!(decode(&encode(&nested(20))).is_err());
        assert!(decode(&encode(&nested(10))).is_ok());
        assert!(decode(&encode(&nested(MAX_TAG_DEPTH))).is_ok());
        assert!(decode(&encode(&nested(MAX_TAG_DEPTH + 1))).is_err());
    }
}
