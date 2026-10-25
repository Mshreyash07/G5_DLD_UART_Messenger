`timescale 1ns/1ps
module secure_uart_top #(
    parameter integer CLK_FREQ_HZ = 50000000,
    parameter integer BAUD_RATE   = 9600,
    parameter integer TX_FIFO_DEPTH = 16
)(
    input  wire clk,
    input  wire rst,

    input  wire [255:0] key,

    input  wire [63:0] nonce_prefix,

    input  wire tx_message_start,
    input  wire [15:0] tx_message_length,
    output wire tx_message_ready,
    input  wire [7:0] tx_data,
    input  wire tx_data_valid,
    output wire tx_data_ready,
    output wire tx_message_busy,
    output reg tx_message_done,
    output reg tx_error,
    output wire tx_nonce_exhausted,

    output wire tx,
    input  wire rx,
    output wire uart_tx_busy,
    output wire uart_tx_done,
    output wire uart_rx_busy,

    
    output wire [7:0]  rx_data,
    output wire rx_data_valid,
    output wire rx_data_last,
    output wire rx_message_done,

    output reg rx_single_error_corrected,
    output reg rx_packet_error,

   
    output wire tx_fifo_full,
    output wire tx_fifo_empty
);

    localparam [1:0] TX_IDLE       = 2'd0;
    localparam [1:0] TX_HEADER     = 2'd1;
    localparam [1:0] TX_PAYLOAD    = 2'd2;
    localparam [1:0] TX_WAIT_DRAIN = 2'd3;

    reg [1:0]  tx_state;
    reg [4:0]  tx_header_index;
    reg [95:0] tx_nonce_reg;
    reg [15:0] tx_length_reg;
    reg [15:0] tx_input_remaining;
    reg [31:0] tx_nonce_counter;
    reg nonce_counter_exhausted;

    wire tx_start_accept;
    wire [95:0] nonce_candidate;

    assign nonce_candidate = {nonce_prefix, tx_nonce_counter};
    assign tx_nonce_exhausted = nonce_counter_exhausted;
    assign tx_message_ready = (tx_state == TX_IDLE) && !nonce_counter_exhausted && (tx_message_length != 16'd0);
    assign tx_start_accept = tx_message_start && tx_message_ready;
    assign tx_message_busy = (tx_state != TX_IDLE);

    function [7:0] make_header_byte;
        input [4:0] index;
        input [95:0] nonce_value;
        input [15:0] length_value;
        begin
            case (index)
                5'd0:  make_header_byte = 8'hC3;
                5'd1:  make_header_byte = 8'h5A;
                5'd2:  make_header_byte = nonce_value[95:88];
                5'd3:  make_header_byte = nonce_value[87:80];
                5'd4:  make_header_byte = nonce_value[79:72];
                5'd5:  make_header_byte = nonce_value[71:64];
                5'd6:  make_header_byte = nonce_value[63:56];
                5'd7:  make_header_byte = nonce_value[55:48];
                5'd8:  make_header_byte = nonce_value[47:40];
                5'd9:  make_header_byte = nonce_value[39:32];
                5'd10: make_header_byte = nonce_value[31:24];
                5'd11: make_header_byte = nonce_value[23:16];
                5'd12: make_header_byte = nonce_value[15:8];
                5'd13: make_header_byte = nonce_value[7:0];
                5'd14: make_header_byte = length_value[15:8];
                5'd15: make_header_byte = length_value[7:0];
                default: make_header_byte = 8'h00;
            endcase
        end
    endfunction
 
    wire [7:0] enc_in_data;
    wire enc_in_valid;
    wire enc_in_ready;
    wire enc_in_last;
    wire [7:0] enc_out_data;
    wire enc_out_valid;
    wire enc_out_ready;
    wire enc_out_last;
    wire enc_busy;
    wire enc_counter_exhausted;

    assign enc_in_data  = tx_data;
    assign enc_in_valid = (tx_state == TX_PAYLOAD) && (tx_input_remaining != 16'd0) && tx_data_valid;
    assign tx_data_ready = (tx_state == TX_PAYLOAD) && (tx_input_remaining != 16'd0) && enc_in_ready;
    assign enc_in_last = (tx_input_remaining == 16'd1);

    chacha20_encrypt encrypt_inst (
        .clk(clk),
        .rst(rst),
        .start(tx_start_accept),
        .key(key),
        .nonce(nonce_candidate),
        .initial_counter(32'd1),
        .in_data(enc_in_data),
        .in_valid(enc_in_valid),
        .in_ready(enc_in_ready),
        .in_last(enc_in_last),
        .out_data(enc_out_data),
        .out_valid(enc_out_valid),
        .out_ready(enc_out_ready),
        .out_last(enc_out_last),
        .busy(enc_busy),
        .counter_exhausted(enc_counter_exhausted)
    );

    wire [7:0]  tx_packet_byte;
    wire [12:0] tx_codeword;
    wire packetizer_start;
    wire [7:0]  packetizer_byte_data;
    wire packetizer_byte_valid;
    wire packetizer_byte_ready;
    wire packetizer_busy;
    wire packetizer_done;

    assign tx_packet_byte = (tx_state == TX_HEADER) ? make_header_byte(tx_header_index, tx_nonce_reg,tx_length_reg) : enc_out_data;
    assign packetizer_start = !packetizer_busy && ((tx_state == TX_HEADER) || ((tx_state == TX_PAYLOAD) && enc_out_valid));
    assign enc_out_ready = (tx_state == TX_PAYLOAD) && !packetizer_busy;

    hamming_encoder tx_hamming_encoder (
        .data_in(tx_packet_byte),
        .codeword_out(tx_codeword)
    );

    hamming_packetizer tx_hamming_packetizer (
        .clk(clk),
        .rst(rst),
        .start(packetizer_start),
        .codeword_in(tx_codeword),
        .byte_ready(packetizer_byte_ready),
        .byte_data(packetizer_byte_data),
        .byte_valid(packetizer_byte_valid),
        .busy(packetizer_busy),
        .done(packetizer_done)
    );

    wire [7:0] fifo_dout;
    wire fifo_rd_en;
    wire fifo_wr_en;
    wire fifo_byte_ctrl_start;
    reg  [1:0] uart_tx_ctrl_state;

    localparam [1:0] UART_CTRL_IDLE  = 2'd0;
    localparam [1:0] UART_CTRL_FETCH = 2'd1;
    localparam [1:0] UART_CTRL_START = 2'd2;
    localparam [1:0] UART_CTRL_WAIT  = 2'd3;

    wire baud_tick;

    assign packetizer_byte_ready = !tx_fifo_full;
    assign fifo_wr_en = packetizer_byte_valid && packetizer_byte_ready;
    assign fifo_rd_en = (uart_tx_ctrl_state == UART_CTRL_FETCH);
    assign fifo_byte_ctrl_start = (uart_tx_ctrl_state == UART_CTRL_START);

    fifo #(
        .DATA_WIDTH(8),
        .DEPTH(TX_FIFO_DEPTH)
    ) tx_byte_fifo (
        .clk(clk),
        .rst(rst),
        .wr_en(fifo_wr_en),
        .rd_en(fifo_rd_en),
        .din(packetizer_byte_data),
        .dout(fifo_dout),
        .full(tx_fifo_full),
        .empty(tx_fifo_empty)
    );

    baud_gen #(
        .CLK_FREQ_HZ(CLK_FREQ_HZ),
        .BAUD_RATE(BAUD_RATE)
    ) baud_gen_inst (
        .clk(clk),
        .rst(rst),
        .baud_tick(baud_tick)
    );

    uart_tx uart_tx_inst (
        .clk(clk),
        .rst(rst),
        .tx_start(fifo_byte_ctrl_start),
        .tx_data(fifo_dout),
        .baud_tick(baud_tick),
        .tx(tx),
        .tx_busy(uart_tx_busy),
        .tx_done(uart_tx_done)
    );

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            uart_tx_ctrl_state <= UART_CTRL_IDLE;
        end else begin
            case (uart_tx_ctrl_state)
                UART_CTRL_IDLE: begin
                    if (!tx_fifo_empty && !uart_tx_busy)
                        uart_tx_ctrl_state <= UART_CTRL_FETCH;
                end
                UART_CTRL_FETCH: begin
                    uart_tx_ctrl_state <= UART_CTRL_START;
                end
                UART_CTRL_START: begin
                    uart_tx_ctrl_state <= UART_CTRL_WAIT;
                end
                UART_CTRL_WAIT: begin
                    if (uart_tx_done)
                        uart_tx_ctrl_state <= UART_CTRL_IDLE;
                end
                default: uart_tx_ctrl_state <= UART_CTRL_IDLE;
            endcase
        end
    end

    wire [7:0] uart_rx_data;
    wire uart_rx_done;
    wire [12:0] rx_codeword;
    wire rx_codeword_valid;
    wire rx_format_error;
    wire [7:0]  rx_decoded_byte;
    wire rx_single_corrected_comb;
    wire rx_double_error_comb;
    wire [3:0]  rx_syndrome;

    uart_rx #(
        .CLK_FREQ_HZ(CLK_FREQ_HZ),
        .BAUD_RATE(BAUD_RATE)
    ) uart_rx_inst (
        .clk(clk),
        .reset(rst),
        .rx(rx),
        .rx_data(uart_rx_data),
        .rx_done(uart_rx_done),
        .rx_busy(uart_rx_busy)
    );

    hamming_depacketizer rx_hamming_depacketizer (
        .clk(clk),
        .rst(rst),
        .byte_data(uart_rx_data),
        .byte_valid(uart_rx_done),
        .codeword_out(rx_codeword),
        .codeword_valid(rx_codeword_valid),
        .format_error(rx_format_error)
    );

    hamming_decoder rx_hamming_decoder (
        .codeword_in(rx_codeword),
        .data_out(rx_decoded_byte),
        .single_error_corrected(rx_single_corrected_comb),
        .double_error_detected(rx_double_error_comb),
        .syndrome(rx_syndrome)
    );

    localparam [2:0] RX_SYNC0     = 3'd0;
    localparam [2:0] RX_SYNC1     = 3'd1;
    localparam [2:0] RX_NONCE     = 3'd2;
    localparam [2:0] RX_LENGTH_HI = 3'd3;
    localparam [2:0] RX_LENGTH_LO = 3'd4;
    localparam [2:0] RX_PAYLOAD   = 3'd5;

    reg [2:0] rx_parse_state;
    reg [95:0] rx_nonce_reg;
    reg [3:0] rx_nonce_index;
    reg [7:0] rx_length_high;
    reg [15:0] rx_payload_remaining;
    reg rx_decrypt_start_pulse;
    reg rx_decrypt_abort_pulse;

    wire decrypt_in_valid;
    wire decrypt_in_ready;
    wire decrypt_in_last;
    wire [7:0] decrypt_out_data;
    wire decrypt_out_valid;
    wire decrypt_out_last;
    wire decrypt_busy;
    wire decrypt_counter_exhausted;
    wire decrypt_reset;

    assign decrypt_reset = rst | rx_decrypt_abort_pulse;
    assign decrypt_in_valid = (rx_parse_state == RX_PAYLOAD) && rx_codeword_valid && !rx_double_error_comb && !rx_format_error;
    assign decrypt_in_last = (rx_payload_remaining == 16'd1);

    chacha20_decrypt decrypt_inst (
        .clk(clk),
        .rst(decrypt_reset),
        .start(rx_decrypt_start_pulse),
        .key(key),
        .nonce(rx_nonce_reg),
        .initial_counter(32'd1),
        .in_data(rx_decoded_byte),
        .in_valid(decrypt_in_valid),
        .in_ready(decrypt_in_ready),
        .in_last(decrypt_in_last),
        .out_data(decrypt_out_data),
        .out_valid(decrypt_out_valid),
        .out_ready(1'b1),
        .out_last(decrypt_out_last),
        .busy(decrypt_busy),
        .counter_exhausted(decrypt_counter_exhausted)
    );

    assign rx_data       = decrypt_out_data;
    assign rx_data_valid = decrypt_out_valid;
    assign rx_data_last  = decrypt_out_last;
    assign rx_message_done = decrypt_out_valid && decrypt_out_last;

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            tx_state                 <= TX_IDLE;
            tx_header_index          <= 5'd0;
            tx_nonce_reg             <= 96'd0;
            tx_length_reg            <= 16'd0;
            tx_input_remaining       <= 16'd0;
            tx_nonce_counter         <= 32'd0;
            nonce_counter_exhausted  <= 1'b0;
            tx_message_done          <= 1'b0;
            tx_error                 <= 1'b0;

            rx_parse_state           <= RX_SYNC0;
            rx_nonce_reg             <= 96'd0;
            rx_nonce_index           <= 4'd0;
            rx_length_high           <= 8'd0;
            rx_payload_remaining     <= 16'd0;
            rx_decrypt_start_pulse   <= 1'b0;
            rx_decrypt_abort_pulse   <= 1'b0;
            rx_single_error_corrected <= 1'b0;
            rx_packet_error          <= 1'b0;
        end else begin
            tx_message_done           <= 1'b0;
            tx_error                  <= 1'b0;
            rx_decrypt_start_pulse    <= 1'b0;
            rx_decrypt_abort_pulse    <= 1'b0;
            rx_single_error_corrected <= 1'b0;
            rx_packet_error           <= 1'b0;

            if (tx_message_start && (tx_state == TX_IDLE) &&(tx_message_length == 16'd0)) begin
                tx_error <= 1'b1;
            end

            if (tx_message_start && (tx_state == TX_IDLE) && nonce_counter_exhausted) begin
                tx_error <= 1'b1;
            end

            if (tx_start_accept) begin
                tx_state           <= TX_HEADER;
                tx_header_index    <= 5'd0;
                tx_nonce_reg       <= nonce_candidate;
                tx_length_reg      <= tx_message_length;
                tx_input_remaining <= tx_message_length;

                if (tx_nonce_counter == 32'hffffffff) begin
                    nonce_counter_exhausted <= 1'b1;
                end else begin
                    tx_nonce_counter <= tx_nonce_counter + 32'd1;
                end
            end

            if ((tx_state == TX_HEADER) && packetizer_start) begin
                if (tx_header_index == 5'd15) begin
                    tx_state <= TX_PAYLOAD;
                end else begin
                    tx_header_index <= tx_header_index + 1'b1;
                end
            end

            if (tx_data_valid && tx_data_ready) begin
                tx_input_remaining <= tx_input_remaining - 16'd1;
            end

            if ((tx_state == TX_PAYLOAD) && packetizer_start && enc_out_last) begin
                
                tx_state <= TX_WAIT_DRAIN;
            end

            if ((tx_state == TX_WAIT_DRAIN) && !packetizer_busy && tx_fifo_empty && !uart_tx_busy && (uart_tx_ctrl_state == UART_CTRL_IDLE)) begin
                tx_state <= TX_IDLE;
                tx_message_done <= 1'b1;
            end

            if (rx_format_error || (rx_codeword_valid && rx_double_error_comb)) begin
                rx_packet_error <= 1'b1;
                rx_parse_state <= RX_SYNC0;
                rx_nonce_index <= 4'd0;
                rx_payload_remaining <= 16'd0;
                rx_decrypt_abort_pulse <= 1'b1;
            end else begin
                if (rx_codeword_valid && rx_single_corrected_comb)
                    rx_single_error_corrected <= 1'b1;

                if (rx_codeword_valid) begin
                    case (rx_parse_state)
                        RX_SYNC0: begin
                            if (rx_decoded_byte == 8'hC3)
                                rx_parse_state <= RX_SYNC1;
                        end

                        RX_SYNC1: begin
                            if (rx_decoded_byte == 8'h5A) begin
                                rx_nonce_reg   <= 96'd0;
                                rx_nonce_index <= 4'd0;
                                rx_parse_state <= RX_NONCE;
                            end else if (rx_decoded_byte == 8'hC3) begin
                                rx_parse_state <= RX_SYNC1;
                            end else begin
                                rx_parse_state <= RX_SYNC0;
                            end
                        end

                        RX_NONCE: begin
                            rx_nonce_reg[95 - (rx_nonce_index * 8) -: 8]
                                <= rx_decoded_byte;
                            if (rx_nonce_index == 4'd11) begin
                                rx_nonce_index <= 4'd0;
                                rx_parse_state <= RX_LENGTH_HI;
                            end else begin
                                rx_nonce_index <= rx_nonce_index + 1'b1;
                            end
                        end

                        RX_LENGTH_HI: begin
                            rx_length_high <= rx_decoded_byte;
                            rx_parse_state <= RX_LENGTH_LO;
                        end

                        RX_LENGTH_LO: begin
                            if ({rx_length_high, rx_decoded_byte} == 16'd0) begin
                                rx_packet_error        <= 1'b1;
                                rx_parse_state         <= RX_SYNC0;
                                rx_decrypt_abort_pulse <= 1'b1;
                            end else begin
                                rx_payload_remaining   <= {rx_length_high,rx_decoded_byte};
                                rx_decrypt_start_pulse <= 1'b1;
                                rx_parse_state         <= RX_PAYLOAD;
                            end
                        end

                        RX_PAYLOAD: begin
                            if (decrypt_in_valid && decrypt_in_ready) begin
                                if (rx_payload_remaining == 16'd1) begin
                                    rx_payload_remaining <= 16'd0;
                                    rx_parse_state       <= RX_SYNC0;
                                end else begin
                                    rx_payload_remaining <= rx_payload_remaining - 16'd1;
                                end
                            end
                        end

                        default: begin
                            rx_parse_state <= RX_SYNC0;
                        end
                    endcase
                end
            end
        end
    end
endmodule