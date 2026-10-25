import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Router, type IRouter } from "express";
import {
  GetHdlModuleParams,
  GetHdlModuleResponse,
  ListHdlModulesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const modules = [
  {
    id: "secure_uart_top",
    title: "Secure UART top-level",
    fileName: "uart_top_1792946441196.v",
    stage: "System integration",
    description:
      "Connects the sender and receiver pipeline: it builds the visible packet header, encrypts payload bytes, applies Hamming protection, queues UART bytes, and coordinates receive-side recovery.",
  },
  {
    id: "chacha20_encrypt",
    title: "ChaCha20 encryptor",
    fileName: "chacha20_encrypt_1792946441193.v",
    stage: "Encryption",
    description:
      "Accepts message bytes and XORs each one with a byte from the ChaCha20 keystream. It forwards ready/valid handshakes and marks the last byte.",
  },
  {
    id: "chacha20_keystream",
    title: "ChaCha20 keystream",
    fileName: "chacha20_keystream_1792946441194.v",
    stage: "Encryption",
    description:
      "Builds 64-byte ChaCha20 blocks from the key, nonce, and counter using quarter-round operations, then supplies the stream a byte at a time.",
  },
  {
    id: "hamming_encoder",
    title: "Hamming encoder",
    fileName: "hamming_encoder_1792946441195.v",
    stage: "Error protection",
    description:
      "Places each 8-bit input byte into a 13-bit SECDED codeword with four Hamming parity bits and one overall parity bit.",
  },
  {
    id: "hamming_packetizer",
    title: "Hamming packetizer",
    fileName: "hamming_packetizer_1792946441195.v",
    stage: "Error protection",
    description:
      "Splits a 13-bit codeword into two UART-friendly bytes, holds each until accepted, and signals when the pair is sent.",
  },
  {
    id: "fifo",
    title: "Transmit FIFO",
    fileName: "fifo_1792946441194.v",
    stage: "Byte transport",
    description:
      "Buffers bytes in a parameterized circular queue, tracking read/write pointers, occupancy, and full/empty status.",
  },
  {
    id: "baud_gen",
    title: "Baud-rate generator",
    fileName: "baud_gen_1792946441192.v",
    stage: "Byte transport",
    description:
      "Divides the system clock to create the timing tick that sets the UART bit rate.",
  },
  {
    id: "uart_tx",
    title: "UART transmitter",
    fileName: "uart_tx_1792946441196.v",
    stage: "Byte transport",
    description:
      "Serializes each queued byte as a low start bit, eight least-significant-bit-first data bits, and a high stop bit.",
  },
  {
    id: "uart_rx",
    title: "UART receiver",
    fileName: "uart_rx_1792946441196.v",
    stage: "Byte transport",
    description:
      "Synchronizes the incoming serial line, checks the start bit, samples eight data bits and the stop bit, then emits the recovered byte.",
  },
  {
    id: "hamming_depacketizer",
    title: "Hamming depacketizer",
    fileName: "hamming_depacketizer_1792946441195.v",
    stage: "Error protection",
    description:
      "Reassembles two received bytes into a 13-bit codeword and flags malformed upper bits in the second byte.",
  },
  {
    id: "hamming_decoder",
    title: "Hamming decoder",
    fileName: "hamming_decoder_1792946441194.v",
    stage: "Error correction",
    description:
      "Calculates the parity syndrome, corrects a single flipped codeword bit, flags detected double-bit errors, and extracts the original byte.",
  },
  {
    id: "chacha20_decrypt",
    title: "ChaCha20 decryptor",
    fileName: "chacha20_decrypt_1792946441193.v",
    stage: "Decryption",
    description:
      "Recovers plaintext by XORing each corrected ciphertext byte with the matching ChaCha20 keystream byte.",
  },
];

router.get("/hdl/modules", (_req, res) => {
  res.json(ListHdlModulesResponse.parse(modules));
});

router.get("/hdl/modules/:id", (req, res) => {
  const parsedParams = GetHdlModuleParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Invalid module id" });
    return;
  }

  const module = modules.find(({ id }) => id === parsedParams.data.id);
  if (!module) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  const code = readFileSync(join(__dirname, "hdl", module.fileName), "utf8");
  res.json(GetHdlModuleResponse.parse({ ...module, code }));
});

export default router;
