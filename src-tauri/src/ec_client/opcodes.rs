//! aMule External Connections (EC) Protocol â€” Opcodes and Tag Constants
#![allow(dead_code)]
//!
//! Reference: amule-org/amule/src/libs/ec/cpp/ECCodes.h
//! Reference: joecarl/amule-ec-client/src/opcodes.ts
//! Protocol version: 0x0204

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Transmission Flags (32-bit header)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

pub const EC_FLAG_ZLIB: u32 = 0x0000_0001;
pub const EC_FLAG_UTF8_NUMBERS: u32 = 0x0000_0002;
pub const EC_FLAG_HAS_ID: u32 = 0x0000_0004;
pub const EC_FLAG_ACCEPTS: u32 = 0x0000_0010;
pub const EC_FLAG_LARGE_TAG_COUNT: u32 = 0x0000_0020; // bit 5 â€” always set in v2
/// Base flags for uncompressed packets (protocol v2 marker)
pub const EC_FLAG_BASE: u32 = 0x0000_0020;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Protocol Version
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

pub const EC_PROTOCOL_VERSION: u16 = 0x0204;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Opcodes (ec_opcode_t â€” uint8)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// --- Authentication ---
pub const EC_OP_NOOP: u8 = 0x01;
pub const EC_OP_AUTH_REQ: u8 = 0x02;
pub const EC_OP_AUTH_FAIL: u8 = 0x03;
pub const EC_OP_AUTH_OK: u8 = 0x04;
pub const EC_OP_AUTH_SALT: u8 = 0x4F;
pub const EC_OP_AUTH_PASSWD: u8 = 0x50;

// --- Control ---
pub const EC_OP_SHUTDOWN: u8 = 0x08;
pub const EC_OP_ADD_LINK: u8 = 0x09;

// --- Statistics & Status ---
pub const EC_OP_STAT_REQ: u8 = 0x0A;
pub const EC_OP_GET_CONNSTATE: u8 = 0x0B;
pub const EC_OP_STATS: u8 = 0x0C;

// --- Downloads ---
pub const EC_OP_GET_DLOAD_QUEUE: u8 = 0x0D;
pub const EC_OP_DLOAD_QUEUE: u8 = 0x1F;
pub const EC_OP_PARTFILE_SWAP_A4AF_THIS: u8 = 0x16;
pub const EC_OP_PARTFILE_PAUSE: u8 = 0x19;
pub const EC_OP_PARTFILE_RESUME: u8 = 0x1A;
pub const EC_OP_PARTFILE_STOP: u8 = 0x1B;
pub const EC_OP_PARTFILE_PRIO_SET: u8 = 0x1C;
pub const EC_OP_PARTFILE_DELETE: u8 = 0x1D;

// --- Uploads ---
pub const EC_OP_GET_ULOAD_QUEUE: u8 = 0x0E;
pub const EC_OP_ULOAD_QUEUE: u8 = 0x20;

// --- Search ---
pub const EC_OP_SEARCH_START: u8 = 0x26;
pub const EC_OP_SEARCH_STOP: u8 = 0x27;
pub const EC_OP_SEARCH_RESULTS: u8 = 0x28;
pub const EC_OP_SEARCH_PROGRESS: u8 = 0x29;
pub const EC_OP_DOWNLOAD_SEARCH_RESULT: u8 = 0x2A;

// --- Servers ---
pub const EC_OP_GET_SERVER_LIST: u8 = 0x2C;
pub const EC_OP_SERVER_LIST: u8 = 0x2D;
pub const EC_OP_SERVER_DISCONNECT: u8 = 0x2E;
pub const EC_OP_SERVER_CONNECT: u8 = 0x2F;
pub const EC_OP_SERVER_REMOVE: u8 = 0x30;
pub const EC_OP_SERVER_ADD: u8 = 0x31;
pub const EC_OP_SERVER_UPDATE_FROM_URL: u8 = 0x32;

// --- Kad ---
pub const EC_OP_KAD_START: u8 = 0x48;
pub const EC_OP_KAD_STOP: u8 = 0x49;
pub const EC_OP_CONNECT: u8 = 0x4A;
pub const EC_OP_DISCONNECT: u8 = 0x4B;
pub const EC_OP_KAD_UPDATE_FROM_URL: u8 = 0x4D;
pub const EC_OP_KAD_BOOTSTRAP_FROM_IP: u8 = 0x4E;

// --- Misc ---
pub const EC_OP_CLEAR_COMPLETED: u8 = 0x53;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tag Names (ec_tagname_t â€” uint16, shifted left by 1 on wire)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// --- Authentication & Protocol Negotiation Tags ---
pub const EC_TAG_STRING: u16 = 0x0000;
pub const EC_TAG_PASSWD_HASH: u16 = 0x0001;
pub const EC_TAG_PROTOCOL_VERSION: u16 = 0x0002;
pub const EC_TAG_VERSION_ID: u16 = 0x0003;
pub const EC_TAG_DETAIL_LEVEL: u16 = 0x0004;
pub const EC_TAG_CONNSTATE: u16 = 0x0005;
pub const EC_TAG_ED2K_ID: u16 = 0x0006;
pub const EC_TAG_LOG_TO_STATUS: u16 = 0x0007;
pub const EC_TAG_BOOTSTRAP_IP: u16 = 0x0008;
pub const EC_TAG_BOOTSTRAP_PORT: u16 = 0x0009;
pub const EC_TAG_CLIENT_ID: u16 = 0x000A;
pub const EC_TAG_PASSWD_SALT: u16 = 0x000B;
pub const EC_TAG_CAN_ZLIB: u16 = 0x000C;
pub const EC_TAG_CAN_UTF8_NUMBERS: u16 = 0x000D;
pub const EC_TAG_CAN_NOTIFY: u16 = 0x000E;
pub const EC_TAG_ECID: u16 = 0x000F;
pub const EC_TAG_KAD_ID: u16 = 0x0010;
pub const EC_TAG_CAN_LARGE_TAG_COUNT: u16 = 0x0011;
pub const EC_TAG_CAN_PARTIAL_UPDATE: u16 = 0x0012;
pub const EC_TAG_FILE_REMOVED: u16 = 0x0013;
pub const EC_TAG_PREFER_NO_ZLIB: u16 = 0x0014;

// --- Client Identification Tags ---
pub const EC_TAG_AUTH_CLIENT_NAME: u16 = 0x0100;
pub const EC_TAG_CLIENT_NAME: u16 = 0x0100;
pub const EC_TAG_CLIENT_VERSION: u16 = 0x0101;
pub const EC_TAG_CLIENT_MOD: u16 = 0x0102;

// --- Statistics Tags ---
pub const EC_TAG_STATS_UL_SPEED: u16 = 0x0200;
pub const EC_TAG_STATS_DL_SPEED: u16 = 0x0201;
pub const EC_TAG_STATS_UL_SPEED_LIMIT: u16 = 0x0202;
pub const EC_TAG_STATS_DL_SPEED_LIMIT: u16 = 0x0203;
pub const EC_TAG_STATS_UP_OVERHEAD: u16 = 0x0204;
pub const EC_TAG_STATS_DOWN_OVERHEAD: u16 = 0x0205;
pub const EC_TAG_STATS_TOTAL_SRC_COUNT: u16 = 0x0206;
pub const EC_TAG_STATS_BANNED_COUNT: u16 = 0x0207;
pub const EC_TAG_STATS_UL_QUEUE_LEN: u16 = 0x0208;
pub const EC_TAG_STATS_ED2K_USERS: u16 = 0x0209;
pub const EC_TAG_STATS_KAD_USERS: u16 = 0x020A;
pub const EC_TAG_STATS_ED2K_FILES: u16 = 0x020B;
pub const EC_TAG_STATS_KAD_FILES: u16 = 0x020C;

// --- PartFile (Download) Tags ---
pub const EC_TAG_PARTFILE: u16 = 0x0300;
pub const EC_TAG_PARTFILE_NAME: u16 = 0x0301;
pub const EC_TAG_PARTFILE_PARTMETID: u16 = 0x0302;
pub const EC_TAG_PARTFILE_SIZE_FULL: u16 = 0x0303;
pub const EC_TAG_PARTFILE_SIZE_XFER: u16 = 0x0304;
pub const EC_TAG_PARTFILE_SIZE_XFER_UP: u16 = 0x0305;
pub const EC_TAG_PARTFILE_SIZE_DONE: u16 = 0x0306;
pub const EC_TAG_PARTFILE_SPEED: u16 = 0x0307;
pub const EC_TAG_PARTFILE_STATUS: u16 = 0x0308;
pub const EC_TAG_PARTFILE_PRIO: u16 = 0x0309;
pub const EC_TAG_PARTFILE_SOURCE_COUNT: u16 = 0x030A;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_A4AF: u16 = 0x030B;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT: u16 = 0x030C;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_XFER: u16 = 0x030D;
pub const EC_TAG_PARTFILE_ED2K_LINK: u16 = 0x030E;
pub const EC_TAG_PARTFILE_CAT: u16 = 0x030F;
pub const EC_TAG_PARTFILE_LAST_RECV: u16 = 0x0310;
pub const EC_TAG_PARTFILE_LAST_SEEN_COMP: u16 = 0x0311;
pub const EC_TAG_PARTFILE_PART_STATUS: u16 = 0x0312;
pub const EC_TAG_PARTFILE_GAP_STATUS: u16 = 0x0313;
pub const EC_TAG_PARTFILE_REQ_STATUS: u16 = 0x0314;
pub const EC_TAG_PARTFILE_SOURCE_NAMES: u16 = 0x0315;
pub const EC_TAG_PARTFILE_COMMENTS: u16 = 0x0316;
pub const EC_TAG_PARTFILE_STOPPED: u16 = 0x0317;
pub const EC_TAG_PARTFILE_DOWNLOAD_ACTIVE: u16 = 0x0318;
pub const EC_TAG_PARTFILE_HASH: u16 = 0x031E;

// --- Known Files ---
pub const EC_TAG_KNOWNFILE: u16 = 0x0400;

// --- Server Tags ---
pub const EC_TAG_SERVER: u16 = 0x0500;
pub const EC_TAG_SERVER_NAME: u16 = 0x0501;
pub const EC_TAG_SERVER_DESC: u16 = 0x0502;
pub const EC_TAG_SERVER_ADDRESS: u16 = 0x0503;
pub const EC_TAG_SERVER_PING: u16 = 0x0504;
pub const EC_TAG_SERVER_USERS: u16 = 0x0505;
pub const EC_TAG_SERVER_USERS_MAX: u16 = 0x0506;
pub const EC_TAG_SERVER_FILES: u16 = 0x0507;
pub const EC_TAG_SERVER_PRIO: u16 = 0x0508;
pub const EC_TAG_SERVER_FAILED: u16 = 0x0509;
pub const EC_TAG_SERVER_STATIC: u16 = 0x050A;
pub const EC_TAG_SERVER_VERSION: u16 = 0x050B;
pub const EC_TAG_SERVER_IP: u16 = 0x050C;
pub const EC_TAG_SERVER_PORT: u16 = 0x050D;

// --- Client / Upload Queue Tags ---
pub const EC_TAG_CLIENT: u16 = 0x0600;
pub const EC_TAG_CLIENT_SOFTWARE: u16 = 0x0601;
pub const EC_TAG_CLIENT_SCORE: u16 = 0x0602;
pub const EC_TAG_CLIENT_HASH: u16 = 0x0603;
pub const EC_TAG_CLIENT_FRIEND_SLOT: u16 = 0x0604;
pub const EC_TAG_CLIENT_UPLOAD_SESSION: u16 = 0x0609;
pub const EC_TAG_CLIENT_UPLOAD_TOTAL: u16 = 0x060A;
pub const EC_TAG_CLIENT_DOWNLOAD_TOTAL: u16 = 0x060B;
pub const EC_TAG_CLIENT_UP_SPEED: u16 = 0x060D;
pub const EC_TAG_CLIENT_DOWN_SPEED: u16 = 0x060E;
pub const EC_TAG_CLIENT_SOFTWARE_NAME: u16 = 0x0614;
pub const EC_TAG_CLIENT_SOFTWARE_VER: u16 = 0x0615;
pub const EC_TAG_CLIENT_UPLOAD_FILE: u16 = 0x061F;
pub const EC_TAG_CLIENT_REMOTE_FILENAME: u16 = 0x0627;

// --- Search Tags ---
pub const EC_TAG_SEARCHFILE: u16 = 0x0700;
pub const EC_TAG_SEARCH_TYPE: u16 = 0x0701;
pub const EC_TAG_SEARCH_NAME: u16 = 0x0702;
pub const EC_TAG_SEARCH_MIN_SIZE: u16 = 0x0703;
pub const EC_TAG_SEARCH_MAX_SIZE: u16 = 0x0704;
pub const EC_TAG_SEARCH_FILE_TYPE: u16 = 0x0705;
pub const EC_TAG_SEARCH_EXTENSION: u16 = 0x0706;
pub const EC_TAG_SEARCH_AVAILABILITY: u16 = 0x0707;
pub const EC_TAG_SEARCH_STATUS: u16 = 0x0708;
pub const EC_TAG_SEARCH_PARENT: u16 = 0x0709;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Tag Data Types (ec_tagtype_t â€” uint8)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

pub const EC_TAGTYPE_UNKNOWN: u8 = 0;
pub const EC_TAGTYPE_CUSTOM: u8 = 1;
pub const EC_TAGTYPE_UINT8: u8 = 2;
pub const EC_TAGTYPE_UINT16: u8 = 3;
pub const EC_TAGTYPE_UINT32: u8 = 4;
pub const EC_TAGTYPE_UINT64: u8 = 5;
pub const EC_TAGTYPE_STRING: u8 = 6;
pub const EC_TAGTYPE_DOUBLE: u8 = 7;
pub const EC_TAGTYPE_IPV4: u8 = 8;
pub const EC_TAGTYPE_HASH16: u8 = 9;
pub const EC_TAGTYPE_UINT128: u8 = 10;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Detail Levels
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

pub const EC_DETAIL_CMD: u8 = 0x00;
pub const EC_DETAIL_WEB: u8 = 0x01;
pub const EC_DETAIL_FULL: u8 = 0x02;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Search Types
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

pub const EC_SEARCH_LOCAL: u8 = 0;
pub const EC_SEARCH_GLOBAL: u8 = 1;
pub const EC_SEARCH_KAD: u8 = 2;

#[cfg(test)]
mod tests {
    use super::*;

    // Values from amule-org/amule src/libs/ec/cpp/ECCodes.h
    #[test]
    fn auth_opcodes_match_amule() {
        assert_eq!(EC_OP_NOOP, 0x01);
        assert_eq!(EC_OP_AUTH_REQ, 0x02);
        assert_eq!(EC_OP_AUTH_FAIL, 0x03);
        assert_eq!(EC_OP_AUTH_OK, 0x04);
        assert_eq!(EC_OP_AUTH_SALT, 0x4F);
        assert_eq!(EC_OP_AUTH_PASSWD, 0x50);
    }

    #[test]
    fn tag_types_and_flags_match_amule() {
        assert_eq!(EC_TAGTYPE_UNKNOWN, 0);
        assert_eq!(EC_TAGTYPE_CUSTOM, 1);
        assert_eq!(EC_TAGTYPE_UINT8, 2);
        assert_eq!(EC_TAGTYPE_UINT16, 3);
        assert_eq!(EC_TAGTYPE_UINT32, 4);
        assert_eq!(EC_TAGTYPE_UINT64, 5);
        assert_eq!(EC_TAGTYPE_STRING, 6);
        assert_eq!(EC_TAGTYPE_DOUBLE, 7);
        assert_eq!(EC_TAGTYPE_IPV4, 8);
        assert_eq!(EC_TAGTYPE_HASH16, 9);
        assert_eq!(EC_TAGTYPE_UINT128, 10);
        assert_eq!(EC_FLAG_ZLIB, 0x01);
        assert_eq!(EC_FLAG_BASE, 0x20);
        assert_eq!(EC_PROTOCOL_VERSION, 0x0204);
    }
}
