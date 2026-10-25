module baud_gen #(
    parameter integer CLK_FREQ_HZ = 50000000,
    parameter integer BAUD_RATE   = 9600
)(
    input  wire clk,
    input  wire rst,
    output reg  baud_tick
);

    
    localparam integer CLKS_PER_BIT = CLK_FREQ_HZ / BAUD_RATE;
    localparam integer COUNTER_WIDTH =
        (CLKS_PER_BIT <= 1) ? 1 : $clog2(CLKS_PER_BIT);

    reg [COUNTER_WIDTH-1:0] counter;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            counter   <= {COUNTER_WIDTH{1'b0}};
            baud_tick <= 1'b0;
        end
        else if (counter == CLKS_PER_BIT - 1) begin
            counter   <= {COUNTER_WIDTH{1'b0}};
            baud_tick <= 1'b1;
        end
        else begin
            counter   <= counter + 1'b1;
            baud_tick <= 1'b0;
        end
    end

endmodule