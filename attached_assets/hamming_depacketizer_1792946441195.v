`timescale 1ns/1ps


module hamming_depacketizer (
    input  wire        clk,
    input  wire        rst,
    input  wire [7:0]  byte_data,
    input  wire        byte_valid,
    output reg  [12:0] codeword_out,
    output reg         codeword_valid,
    output reg         format_error
);

    reg [7:0] first_byte;
    reg       waiting_for_second;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            first_byte        <= 8'h00;
            waiting_for_second <= 1'b0;
            codeword_out      <= 13'b0;
            codeword_valid    <= 1'b0;
            format_error      <= 1'b0;
        end
        else begin
            codeword_valid <= 1'b0;
            format_error   <= 1'b0;

            if (byte_valid) begin
                if (!waiting_for_second) begin
                    first_byte         <= byte_data;
                    waiting_for_second <= 1'b1;
                end
                else begin
               
                    if (byte_data[7:5] != 3'b000) begin
                        format_error <= 1'b1;
                    end
                    else begin
                        codeword_out   <= {byte_data[4:0], first_byte};
                        codeword_valid <= 1'b1;
                    end
                    waiting_for_second <= 1'b0;
                end
            end
        end
    end

endmodule
