module uart_tx (
    input  wire       clk,
    input  wire       rst,
    input  wire       tx_start,
    input  wire [7:0] tx_data,
    input  wire       baud_tick,
    output reg        tx,
    output reg        tx_busy,
    output reg        tx_done
);

    localparam [2:0] IDLE       = 3'd0;
    localparam [2:0] START_WAIT = 3'd1;
    localparam [2:0] START_BIT  = 3'd2;
    localparam [2:0] DATA       = 3'd3;
    localparam [2:0] STOP_BIT   = 3'd4;
    localparam [2:0] STOP_HOLD  = 3'd5;

    reg [2:0] state;
    reg [7:0] shift_reg;
    reg [2:0] bit_index;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            state     <= IDLE;
            shift_reg <= 8'b0;
            bit_index <= 3'b0;
            tx        <= 1'b1;
            tx_busy   <= 1'b0;
            tx_done   <= 1'b0;
        end
        else begin
            tx_done <= 1'b0;

            case (state)
                IDLE: begin
                    tx      <= 1'b1;
                    tx_busy <= 1'b0;
                    if (tx_start) begin
                        shift_reg <= tx_data;
                        bit_index <= 3'd0;
                        tx_busy   <= 1'b1;
                        state     <= START_WAIT;
                    end
                end

                START_WAIT: begin
                    if (baud_tick) begin
                        tx    <= 1'b0;
                        state <= START_BIT;
                    end
                end

                START_BIT: begin
                    if (baud_tick) begin
                        tx        <= shift_reg[0];
                        shift_reg <= {1'b0, shift_reg[7:1]};
                        bit_index <= 3'd1;
                        state     <= DATA;
                    end
                end

                DATA: begin
                    if (baud_tick) begin
                        tx        <= shift_reg[0];
                        shift_reg <= {1'b0, shift_reg[7:1]};

                        if (bit_index == 3'd7)
                            state <= STOP_BIT;
                        else
                            bit_index <= bit_index + 1'b1;
                    end
                end

                STOP_BIT: begin
                    if (baud_tick) begin
                        tx    <= 1'b1;
                        state <= STOP_HOLD;
                    end
                end

                STOP_HOLD: begin
                    if (baud_tick) begin
                        tx      <= 1'b1;
                        tx_busy <= 1'b0;
                        tx_done <= 1'b1;
                        state   <= IDLE;
                    end
                end

                default: begin
                    state   <= IDLE;
                    tx      <= 1'b1;
                    tx_busy <= 1'b0;
                    tx_done <= 1'b0;
                end
            endcase
        end
    end

endmodule