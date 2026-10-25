---
name: Secure UART presentation demo
description: Product goals for the educational secure-UART presentation.
---

The project is a final-presentation demo of the user's secure UART Verilog design. Preserve the visible path from plaintext through encryption, error correction, and reception; the passive interceptor should only see ciphertext, and each pipeline module should expose its uploaded HDL and an accessible explanation. Keep the browser simulator clearly distinguished from cycle-accurate RTL behavior. The payload is encrypted, but the top-level protocol header is transmitted in clear.

**Why:** The user specified these points as the core of the project presentation.

**How to apply:** Preserve these distinctions when extending the simulation or presentation flow; do not imply that Hamming provides secrecy or that the entire protocol header is encrypted.
