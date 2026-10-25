`timescale 1ns/1ps

module hamming_encoder (
    input  wire [7:0]  data_in,
    output reg  [12:0] codeword_out
);

    always @* begin
        codeword_out = 13'b0;

        codeword_out[2]  = data_in[0]; 
        codeword_out[5]  = data_in[2]; 
        codeword_out[4]  = data_in[1]; 
        codeword_out[6]  = data_in[3]; 
        codeword_out[8]  = data_in[4]; 
        codeword_out[9]  = data_in[5]; 
        codeword_out[10] = data_in[6]; 
        codeword_out[11] = data_in[7]; 

        codeword_out[0] = codeword_out[2] ^ codeword_out[4] ^
                          codeword_out[6] ^ codeword_out[8] ^
                          codeword_out[10]; 

        codeword_out[1] = codeword_out[2] ^ codeword_out[5] ^
                          codeword_out[6] ^ codeword_out[9] ^
                          codeword_out[10];

        codeword_out[3] = codeword_out[4] ^ codeword_out[5] ^
                          codeword_out[6] ^ codeword_out[11];

        codeword_out[7] = codeword_out[8] ^ codeword_out[9] ^
                          codeword_out[10] ^ codeword_out[11];

        codeword_out[12] = ^codeword_out[11:0];
    end

endmodule
