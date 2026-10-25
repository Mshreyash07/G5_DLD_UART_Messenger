
`timescale 1ns/1ps


module hamming_decoder (
    input  wire [12:0] codeword_in,
    output reg  [7:0]  data_out,
    output reg         single_error_corrected,
    output reg         double_error_detected,
    output reg  [3:0]  syndrome
);

    reg [12:0] corrected_codeword;
    reg overall_parity;

    always @* begin
        
        syndrome[0] = codeword_in[0] ^ codeword_in[2] ^
                      codeword_in[4] ^ codeword_in[6] ^
                      codeword_in[8] ^ codeword_in[10];

        syndrome[1] = codeword_in[1] ^ codeword_in[2] ^
                      codeword_in[5] ^ codeword_in[6] ^
                      codeword_in[9] ^ codeword_in[10];

        syndrome[2] = codeword_in[3] ^ codeword_in[4] ^
                      codeword_in[5] ^ codeword_in[6] ^
                      codeword_in[11];

        syndrome[3] = codeword_in[7] ^ codeword_in[8] ^
                      codeword_in[9] ^ codeword_in[10] ^
                      codeword_in[11];

       
        overall_parity = ^codeword_in;
        corrected_codeword = codeword_in;
        single_error_corrected = 1'b0;
        double_error_detected = 1'b0;
        data_out = 8'h00;

        if ((syndrome == 4'b0000) && (overall_parity == 1'b0)) begin
           
            corrected_codeword = codeword_in;
        end
        else if ((syndrome != 4'b0000) && (overall_parity == 1'b1)) begin
            
            if ((syndrome >= 4'd1) && (syndrome <= 4'd12)) begin
                corrected_codeword[syndrome - 1'b1] =
                    ~corrected_codeword[syndrome - 1'b1];
                single_error_corrected = 1'b1;
            end
            else begin
                
                double_error_detected = 1'b1;
            end
        end
        else if ((syndrome == 4'b0000) && (overall_parity == 1'b1)) begin
            
            corrected_codeword[12] = ~corrected_codeword[12];
            single_error_corrected = 1'b1;
        end
        else begin
       
            double_error_detected = 1'b1;
        end

        if (!double_error_detected) begin
            data_out = {
                corrected_codeword[11], 
                corrected_codeword[10], 
                corrected_codeword[9],  
                corrected_codeword[8],  
                corrected_codeword[6],  
                corrected_codeword[5],  
                corrected_codeword[4],  
                corrected_codeword[2]
            };
        end
    end

endmodule
