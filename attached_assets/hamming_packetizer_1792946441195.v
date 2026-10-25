`timescale 1ns/1ps

module hamming_packetizer (
    input  wire        clk,
    input  wire        rst,
    input  wire        start,
    input  wire [12:0] codeword_in,
    input  wire        byte_ready,
    output reg  [7:0]  byte_data,
    output reg         byte_valid,
    output wire        busy,
    output reg         done
);

    localparam [1:0] IDLE      = 2'd0;
    localparam [1:0] SEND_LOW  = 2'd1;
    localparam [1:0] SEND_HIGH = 2'd2;

    reg [1:0] state;
    reg [12:0] saved_codeword;

    assign busy = (state != IDLE);

    always @* begin
        byte_data  = 8'h00;
        byte_valid = 1'b0;

        case (state)
            SEND_LOW: begin
                byte_data  = saved_codeword[7:0];
                byte_valid = 1'b1;
            end
            SEND_HIGH: begin
                byte_data  = {3'b000, saved_codeword[12:8]};
                byte_valid = 1'b1;
            end
            default: begin
                byte_data  = 8'h00;
                byte_valid = 1'b0;
            end
        endcase
    end

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            state          <= IDLE;
            saved_codeword <= 13'b0;
            done           <= 1'b0;
        end
        else begin
            done <= 1'b0;

            case (state)
                IDLE: begin
                    if (start) begin
                        saved_codeword <= codeword_in;
                        state <= SEND_LOW;
                    end
                end

                SEND_LOW: begin
                    if (byte_valid && byte_ready)
                        state <= SEND_HIGH;
                end

                SEND_HIGH: begin
                    if (byte_valid && byte_ready) begin
                        state <= IDLE;
                        done  <= 1'b1;
                    end
                end

                default: state <= IDLE;
            endcase
        end
    end

endmodule
