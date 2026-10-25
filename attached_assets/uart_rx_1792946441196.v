module uart_rx #(
    parameter integer CLK_FREQ_HZ = 50000000,
    parameter integer BAUD_RATE   = 9600,

    parameter integer CLKS_PER_BIT = CLK_FREQ_HZ / BAUD_RATE
)(
    input  wire       clk,
    input  wire       reset,
    input  wire       rx,
    output reg  [7:0] rx_data,
    output reg        rx_done,
    output reg        rx_busy
);

    localparam [1:0] IDLE  = 2'b00;
    localparam [1:0] START = 2'b01;
    localparam [1:0] DATA  = 2'b10;
    localparam [1:0] STOP  = 2'b11;

    localparam integer COUNT_WIDTH =
        (CLKS_PER_BIT <= 1) ? 1 : $clog2(CLKS_PER_BIT);

    reg [1:0] state;
    reg [7:0] shift_reg;
    reg [2:0] bit_index;
    reg [COUNT_WIDTH-1:0] clk_count;

    reg rx_meta;
    reg rx_sync;

    always @(posedge clk or posedge reset) begin
        if (reset) begin
            rx_meta   <= 1'b1;
            rx_sync   <= 1'b1;
            state     <= IDLE;
            rx_data   <= 8'b0;
            rx_done   <= 1'b0;
            rx_busy   <= 1'b0;
            shift_reg <= 8'b0;
            bit_index <= 3'b0;
            clk_count <= {COUNT_WIDTH{1'b0}};
        end
        else begin
            rx_meta <= rx;
            rx_sync <= rx_meta;
            rx_done <= 1'b0;

            case (state)
                IDLE: begin
                    rx_busy   <= 1'b0;
                    clk_count <= {COUNT_WIDTH{1'b0}};
                    bit_index <= 3'b0;

                  
                    if (rx_sync == 1'b0) begin
                        state   <= START;
                        rx_busy <= 1'b1;
                    end
                end

                START: begin
                  
                    if (clk_count == (CLKS_PER_BIT / 2 - 1)) begin
                        clk_count <= {COUNT_WIDTH{1'b0}};
                        if (rx_sync == 1'b0) begin
                            state     <= DATA;
                            bit_index <= 3'd0;
                        end
                        else begin
                            state   <= IDLE; 
                            rx_busy <= 1'b0;
                        end
                    end
                    else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end

                DATA: begin
                  
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= {COUNT_WIDTH{1'b0}};
                        
                        shift_reg <= {rx_sync, shift_reg[7:1]};

                        if (bit_index == 3'd7)
                            state <= STOP;
                        else
                            bit_index <= bit_index + 1'b1;
                    end
                    else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end

                STOP: begin
                    
                    if (clk_count == CLKS_PER_BIT - 1) begin
                        clk_count <= {COUNT_WIDTH{1'b0}};
                        state     <= IDLE;
                        rx_busy   <= 1'b0;
                        if (rx_sync == 1'b1) begin
                            rx_data <= shift_reg;
                            rx_done <= 1'b1;
                        end
                    end
                    else begin
                        clk_count <= clk_count + 1'b1;
                    end
                end

                default: begin
                    state     <= IDLE;
                    clk_count <= {COUNT_WIDTH{1'b0}};
                    rx_busy   <= 1'b0;
                end
            endcase
        end
    end

endmodule