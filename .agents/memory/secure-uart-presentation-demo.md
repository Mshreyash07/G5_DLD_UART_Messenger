---
name: Secure UART presentation demo
description: Product goals for the educational secure-UART presentation.
---

The project is a final-presentation demo of the user's secure UART Verilog design. Preserve the visible path from plaintext through encryption, error correction, and reception; show the keystream only as an explicitly labeled simulator trace, not as information a passive wire listener can derive. Each pipeline module should expose its uploaded HDL and an accessible explanation. Keep the browser simulator clearly distinguished from cycle-accurate RTL behavior. The payload is encrypted, but the top-level protocol header is transmitted in clear.

The educational two-bit-error mode deliberately feeds uncorrected data through decryption to demonstrate corrupted output. The uploaded Hamming decoder instead asserts its double-error flag and leaves `data_out` at zero for that codeword, so the simulator must label this difference from RTL behavior.

**Why:** The user specified these points as the core of the project presentation.

**How to apply:** Preserve these distinctions when extending the simulation or presentation flow; do not imply that Hamming provides secrecy, that keystream is wire-visible, or that the entire protocol header is encrypted.
