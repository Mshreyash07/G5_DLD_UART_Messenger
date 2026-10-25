module fifo #(
    parameter integer DATA_WIDTH = 8,
    parameter integer DEPTH = 16
)(
    input  wire clk,
    input  wire rst,
    input  wire wr_en,
    input  wire rd_en,
    input  wire [DATA_WIDTH-1:0] din,
    output reg  [DATA_WIDTH-1:0] dout,
    output wire full,
    output wire  empty
);

    localparam integer ADDR_WIDTH = (DEPTH <= 2) ? 1 : $clog2(DEPTH);
    localparam integer COUNT_WIDTH = $clog2(DEPTH + 1);

    reg [DATA_WIDTH-1:0] mem [0:DEPTH-1];
    reg [ADDR_WIDTH-1:0] wr_ptr;
    reg [ADDR_WIDTH-1:0] rd_ptr;
    reg [COUNT_WIDTH-1:0] count;

    wire do_read;
    wire do_write;

    assign empty = (count == 0);
    assign full  = (count == DEPTH);

    assign do_read  = rd_en && !empty;
    assign do_write = wr_en && (!full || do_read);

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            wr_ptr <= {ADDR_WIDTH{1'b0}};
            rd_ptr <= {ADDR_WIDTH{1'b0}};
            count  <= {COUNT_WIDTH{1'b0}};
            dout   <= {DATA_WIDTH{1'b0}};
        end
        else begin
            if (do_write) begin
                mem[wr_ptr] <= din;
                if (wr_ptr == DEPTH - 1)
                    wr_ptr <= {ADDR_WIDTH{1'b0}};
                else
                    wr_ptr <= wr_ptr + 1'b1;
            end

            if (do_read) begin
                dout <= mem[rd_ptr];
                if (rd_ptr == DEPTH - 1)
                    rd_ptr <= {ADDR_WIDTH{1'b0}};
                else
                    rd_ptr <= rd_ptr + 1'b1;
            end

            case ({do_write, do_read})
                2'b10: count <= count + 1'b1;
                2'b01: count <= count - 1'b1;
                default: count <= count;
            endcase
        end
    end

endmodule