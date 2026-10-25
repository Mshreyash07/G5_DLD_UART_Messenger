`timescale 1ns/1ps

module chacha20_keystream (
    input  wire         clk,
    input  wire         rst,           
    input  wire         start,
    input  wire [255:0] key,
    input  wire [95:0]  nonce,
    input  wire [31:0]  initial_counter,

    input  wire         consume_byte,
    input  wire         message_last,

    output wire [7:0]   keystream_byte,
    output wire         keystream_valid,
    output wire         busy,
    output reg          counter_exhausted
);

    reg active;
    reg [255:0] key_reg;
    reg [95:0]  nonce_reg;
    reg [31:0]  counter_reg;
    reg [511:0] keystream_block;
    reg [5:0] byte_index;

    assign busy = active;
    assign keystream_valid = active && !counter_exhausted;
    assign keystream_byte = keystream_block[511 - (byte_index * 8) -: 8];

    function [31:0] bytes_to_word_le;
        input [31:0] bytes;
        begin
            bytes_to_word_le = {bytes[7:0], bytes[15:8], bytes[23:16], bytes[31:24]};
        end
    endfunction

    function [31:0] rotl32;
        input [31:0] value;
        input integer amount;
        begin
            rotl32 = (value << amount) | (value >> (32 - amount));
        end
    endfunction

    function [127:0] quarter_round;
        input [31:0] a_in;
        input [31:0] b_in;
        input [31:0] c_in;
        input [31:0] d_in;
        reg [31:0] a, b, c, d;
        begin
            a = a_in;
            b = b_in;
            c = c_in;
            d = d_in;

            a = a + b;
            d = rotl32(d ^ a, 16);

            c = c + d;
            b = rotl32(b ^ c, 12);

            a = a + b;
            d = rotl32(d ^ a, 8);

            c = c + d;
            b = rotl32(b ^ c, 7);

            quarter_round = {a, b, c, d};
        end
    endfunction

    function [511:0] chacha20_block;
        input [255:0] key_in;
        input [95:0]  nonce_in;
        input [31:0]  counter_in;
        reg [31:0] x [0:15];
        reg [31:0] initial_state [0:15];
        integer i;
        integer round_index;
        begin
       
            initial_state[0] = 32'h61707865;
            initial_state[1] = 32'h3320646e;
            initial_state[2] = 32'h79622d32;
            initial_state[3] = 32'h6b206574;

            for (i = 0; i < 8; i = i + 1)
                initial_state[4+i] = bytes_to_word_le(key_in[255-(i*32) -: 32]);

            initial_state[12] = counter_in;
            initial_state[13] = bytes_to_word_le(nonce_in[95:64]);
            initial_state[14] = bytes_to_word_le(nonce_in[63:32]);
            initial_state[15] = bytes_to_word_le(nonce_in[31:0]);

            for (i = 0; i < 16; i = i + 1)
                x[i] = initial_state[i];

       
            for (round_index = 0; round_index < 10; round_index = round_index + 1) begin
              
                {x[0], x[4], x[8],  x[12]} = quarter_round(x[0], x[4], x[8],  x[12]);
                {x[1], x[5], x[9],  x[13]} = quarter_round(x[1], x[5], x[9],  x[13]);
                {x[2], x[6], x[10], x[14]} = quarter_round(x[2], x[6], x[10], x[14]);
                {x[3], x[7], x[11], x[15]} = quarter_round(x[3], x[7], x[11], x[15]);

           
                {x[0], x[5], x[10], x[15]} = quarter_round(x[0], x[5], x[10], x[15]);
                {x[1], x[6], x[11], x[12]} = quarter_round(x[1], x[6], x[11], x[12]);
                {x[2], x[7], x[8],  x[13]} = quarter_round(x[2], x[7], x[8],  x[13]);
                {x[3], x[4], x[9],  x[14]} = quarter_round(x[3], x[4], x[9],  x[14]);
            end

            
            for (i = 0; i < 16; i = i + 1)
                chacha20_block[511-(i*32) -: 32] = bytes_to_word_le(x[i] + initial_state[i]);
        end
    endfunction

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            active            <= 1'b0;
            key_reg           <= 256'd0;
            nonce_reg         <= 96'd0;
            counter_reg       <= 32'd0;
            keystream_block   <= 512'd0;
            byte_index        <= 6'd0;
            counter_exhausted <= 1'b0;
        end else begin
            if (start && !active) begin
                key_reg           <= key;
                nonce_reg         <= nonce;
                counter_reg       <= initial_counter;
                keystream_block   <= chacha20_block(key, nonce, initial_counter);
                byte_index        <= 6'd0;
                active            <= 1'b1;
                counter_exhausted <= 1'b0;
            end else if (consume_byte && keystream_valid) begin
                if (message_last) begin
                    active <= 1'b0;
                end else if (byte_index == 6'd63) begin
                    if (counter_reg == 32'hffffffff) begin
                        active            <= 1'b0;
                        counter_exhausted <= 1'b1;
                    end else begin
                        counter_reg     <= counter_reg + 32'd1;
                        keystream_block <= chacha20_block(key_reg, nonce_reg,
                                                          counter_reg + 32'd1);
                        byte_index      <= 6'd0;
                    end
                end else begin
                    byte_index <= byte_index + 6'd1;
                end
            end
        end
    end

endmodule
