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

// --- Authentication Tags ---
pub const EC_TAG_STRING: u16 = 0x0000;
pub const EC_TAG_PASSWD_HASH: u16 = 0x0001;
pub const EC_TAG_PROTOCOL_VERSION: u16 = 0x0002;
pub const EC_TAG_VERSION_ID: u16 = 0x0003;
pub const EC_TAG_DETAIL_LEVEL: u16 = 0x0004;
pub const EC_TAG_CONNSTATE: u16 = 0x0005;
pub const EC_TAG_AUTH_CLIENT_NAME: u16 = 0x0006;
pub const EC_TAG_CLIENT_VERSION: u16 = 0x0007;
pub const EC_TAG_PASSWD_SALT: u16 = 0x0008;
pub const EC_TAG_CAN_ZLIB: u16 = 0x0009;
pub const EC_TAG_CAN_UTF8_NUMBERS: u16 = 0x000A;
pub const EC_TAG_CAN_LARGE_TAG_COUNT: u16 = 0x0011;

// --- Statistics Tags ---
pub const EC_TAG_STATS_UL_SPEED: u16 = 0x0100;
pub const EC_TAG_STATS_DL_SPEED: u16 = 0x0101;
pub const EC_TAG_STATS_UL_SPEED_LIMIT: u16 = 0x0102;
pub const EC_TAG_STATS_DL_SPEED_LIMIT: u16 = 0x0103;
pub const EC_TAG_STATS_CURR_UL_COUNT: u16 = 0x0104;
pub const EC_TAG_STATS_CURR_DL_COUNT: u16 = 0x0105;
pub const EC_TAG_STATS_UL_QUEUE_LEN: u16 = 0x0106;

// --- Server Tags ---
pub const EC_TAG_SERVER: u16 = 0x0200;
pub const EC_TAG_SERVER_NAME: u16 = 0x0201;
pub const EC_TAG_SERVER_DESC: u16 = 0x0202;
pub const EC_TAG_SERVER_ADDRESS: u16 = 0x0203;
pub const EC_TAG_SERVER_PING: u16 = 0x0204;
pub const EC_TAG_SERVER_USERS: u16 = 0x0205;
pub const EC_TAG_SERVER_USERS_MAX: u16 = 0x0206;
pub const EC_TAG_SERVER_FILES: u16 = 0x0207;
pub const EC_TAG_SERVER_PRIO: u16 = 0x0208;
pub const EC_TAG_SERVER_FAILED: u16 = 0x0209;
pub const EC_TAG_SERVER_STATIC: u16 = 0x020A;
pub const EC_TAG_SERVER_VERSION: u16 = 0x020B;
pub const EC_TAG_SERVER_IP: u16 = 0x020C;
pub const EC_TAG_SERVER_PORT: u16 = 0x020D;

// --- PartFile (Download) Tags ---
pub const EC_TAG_PARTFILE: u16 = 0x0300;
pub const EC_TAG_PARTFILE_NAME: u16 = 0x0301;
pub const EC_TAG_PARTFILE_PARTMETID: u16 = 0x0302;
pub const EC_TAG_PARTFILE_SIZE_FULL: u16 = 0x0303;
pub const EC_TAG_PARTFILE_SIZE_XFER: u16 = 0x0304;
pub const EC_TAG_PARTFILE_SIZE_DONE: u16 = 0x0305;
pub const EC_TAG_PARTFILE_SPEED: u16 = 0x0306;
pub const EC_TAG_PARTFILE_STATUS: u16 = 0x0307;
pub const EC_TAG_PARTFILE_PRIO: u16 = 0x0308;
pub const EC_TAG_PARTFILE_SOURCE_COUNT: u16 = 0x0309;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_A4AF: u16 = 0x030A;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT: u16 = 0x030B;
pub const EC_TAG_PARTFILE_SOURCE_COUNT_XFER: u16 = 0x030C;
pub const EC_TAG_PARTFILE_ED2K_LINK: u16 = 0x030D;
pub const EC_TAG_PARTFILE_CAT: u16 = 0x030E;
pub const EC_TAG_PARTFILE_LAST_RECV: u16 = 0x030F;
pub const EC_TAG_PARTFILE_LAST_SEEN_COMP: u16 = 0x0310;
pub const EC_TAG_PARTFILE_PART_STATUS: u16 = 0x0311;
pub const EC_TAG_PARTFILE_GAP_STATUS: u16 = 0x0312;
pub const EC_TAG_PARTFILE_REQ_STATUS: u16 = 0x0313;
pub const EC_TAG_PARTFILE_SOURCE_NAMES: u16 = 0x0314;
pub const EC_TAG_PARTFILE_COMMENTS: u16 = 0x0315;
pub const EC_TAG_PARTFILE_STOPPED: u16 = 0x0316;
pub const EC_TAG_PARTFILE_HASH: u16 = 0x0320;

// --- Search Tags ---
pub const EC_TAG_SEARCH_TYPE: u16 = 0x0400;
pub const EC_TAG_SEARCH_NAME: u16 = 0x0401;
pub const EC_TAG_SEARCH_MIN_SIZE: u16 = 0x0402;
pub const EC_TAG_SEARCH_MAX_SIZE: u16 = 0x0403;
pub const EC_TAG_SEARCH_FILE_TYPE: u16 = 0x0404;
pub const EC_TAG_SEARCH_EXTENSION: u16 = 0x0405;
pub const EC_TAG_SEARCH_AVAILABILITY: u16 = 0x0406;

pub const EC_TAG_SEARCH_FILE: u16 = 0x0500;
pub const EC_TAG_SEARCH_FILE_NAME: u16 = 0x0501;
pub const EC_TAG_SEARCH_FILE_SIZE: u16 = 0x0502;
pub const EC_TAG_SEARCH_FILE_HASH: u16 = 0x0503;
pub const EC_TAG_SEARCH_FILE_SOURCE_COUNT: u16 = 0x0504;
pub const EC_TAG_SEARCH_FILE_COMPLETE_SOURCE_COUNT: u16 = 0x0505;

// --- Kad Tags ---
pub const EC_TAG_KAD_BOOTSTRAP_IP: u16 = 0x0600;
pub const EC_TAG_KAD_BOOTSTRAP_PORT: u16 = 0x0601;

// --- Upload Client Tags ---
pub const EC_TAG_CLIENT: u16 = 0x0700;
pub const EC_TAG_CLIENT_NAME: u16 = 0x0701;
pub const EC_TAG_CLIENT_UPLOAD_SPEED: u16 = 0x0702;
pub const EC_TAG_CLIENT_TRANSFERRED_UP: u16 = 0x0703;
pub const EC_TAG_CLIENT_FILE_NAME: u16 = 0x0704;

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
