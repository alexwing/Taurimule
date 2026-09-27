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
        if self.data.len() >= 1 {
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

    /// Calculate the total wire size of this tag's data + children.
    fn data_len(&self) -> u32 {
        let children_size: u32 = self.children.iter().map(|c| c.wire_size()).sum();
        let child_count_field: u32 = if !self.children.is_empty() { 2 } else { 0 };
        child_count_field + children_size + self.data.len() as u32
    }

    /// Total size on the wire (header + data + children).
    pub fn wire_size(&self) -> u32 {
        // 2 (name) + 1 (type) + 4 (len) + data_len
        7 + self.data_len()
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
            children_total_size += 2; // the child_count field itself

            for _ in 0..child_count {
                let start_pos = cursor.position();
                let child = EcTag::read_from(cursor)?;
                children_total_size += (cursor.position() - start_pos) as usize;
                children.push(child);
            }
        }

        // Remaining bytes are the tag's own data
        let data_size = tag_len.saturating_sub(children_total_size);
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
