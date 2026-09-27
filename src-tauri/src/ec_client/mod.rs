//! EC Client — aMule External Connections protocol implementation.
//!
//! This module provides a native Rust client for the binary EC protocol
//! used by amuled for remote control (TCP port 4712).
#![allow(dead_code)]

pub mod connection;
pub mod opcodes;
pub mod packet;
pub mod tags;
pub mod types;

pub use connection::EcConnection;
