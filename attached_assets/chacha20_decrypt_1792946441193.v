`timescale 1ns/1ps

module chacha20_decrypt (
    input  wire         clk,
    input  wire         rst,

    input  wire         start,
    input  wire [255:0] key,
    input  wire [95:0]  nonce,
    input  wire [31:0]  initial_counter,

    input  wire [7:0]   in_data,
    input  wire         in_valid,
    output wire         in_ready,
    input  wire         in_last,

    output reg  [7:0]   out_data,
    output reg          out_valid,
    input  wire         out_ready,
    output reg          out_last,

    output wire         busy,
    output wire         counter_exhausted
);

    wire core_start;
    wire core_busy;
    wire ks_valid;
    wire [7:0] ks_byte;
    wire consume_byte;

    assign busy = core_busy | out_valid;
    assign core_start = start && !busy;
    assign in_ready = ks_valid && (!out_valid || out_ready);
    assign consume_byte = in_valid && in_ready;

    chacha20_keystream ks (
        .clk(clk),
        .rst(rst),
        .start(core_start),
        .key(key),
        .nonce(nonce),
        .initial_counter(initial_counter),
        .consume_byte(consume_byte),
        .message_last(in_last),
        .keystream_byte(ks_byte),
        .keystream_valid(ks_valid),
        .busy(core_busy),
        .counter_exhausted(counter_exhausted)
    );

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            out_data  <= 8'd0;
            out_valid <= 1'b0;
            out_last  <= 1'b0;
        end else begin
            if (out_valid && out_ready) begin
                out_valid <= 1'b0;
                out_last  <= 1'b0;
            end

            if (consume_byte) begin
                out_data  <= in_data ^ ks_byte;
                out_valid <= 1'b1;
                out_last  <= in_last;
            end
        end
    end

endmodule
