/**
 * Receipt Generator Module
 * Generates PDF receipts for shipment payments using jsPDF library
 * Requires: jsPDF library loaded in HTML
 */

const RECEIPT_CONFIG = {
    pageWidth: 210,    // A4 width mm
    pageHeight: 297,   // A4 height mm
    margin: 15,
    colors: {
        primary: [59, 130, 246],      // Blue
        success: [34, 197, 94],       // Green
        text: [30, 30, 30],           // Dark gray
        textLight: [120, 120, 120],   // Light gray
        border: [230, 230, 230]       // Light border
    }
};

/**
 * Download receipt as PDF
 * @param {Number} shipmentId - Shipment ID
 * @param {String} userPrefix - User prefix (e.g., "SS")
 */
async function downloadReceipt(shipmentId, userPrefix = 'SS') {
    try {
        // 1. Fetch receipt data from backend
        const res = await fetch(`${window.API_BASE_URL||""}/api/v3/payment/receipt/${shipmentId}`, {
            credentials: 'include'
        });
        
        if (!res.ok) {
            showToast('Failed to load receipt data', 'error');
            return;
        }
        
        const data = await res.json();
        if (!data.success || !data.receipt) {
            showToast('Receipt not found', 'error');
            return;
        }
        
        const receipt = data.receipt;
        
        // 2. Create PDF document
        if (typeof jsPDF === 'undefined') {
            showToast('PDF library not loaded. Trying alternate method...', 'warning');
            downloadReceiptHTML(receipt);
            return;
        }
        
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        let yPos = RECEIPT_CONFIG.margin;
        const pageWidth = RECEIPT_CONFIG.pageWidth - (2 * RECEIPT_CONFIG.margin);
        
        // 3. Header - Company Branding
        pdf.setFillColor(...RECEIPT_CONFIG.colors.primary);
        pdf.rect(0, 0, RECEIPT_CONFIG.pageWidth, 50, 'F');
        
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(24);
        pdf.setFont(undefined, 'bold');
        pdf.text('⚓ SMART SHIPPING', RECEIPT_CONFIG.margin, 20);
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'normal');
        pdf.text('Global Logistics Partner', RECEIPT_CONFIG.margin, 30);
        pdf.text('Enterprise Shipping Solutions', RECEIPT_CONFIG.margin, 37);
        
        // Date & Reference
        pdf.setTextColor(...RECEIPT_CONFIG.colors.textLight);
        pdf.setFontSize(8);
        pdf.text(`Receipt Date: ${new Date(receipt.receiptDate).toLocaleDateString('en-GB')}`, RECEIPT_CONFIG.pageWidth - RECEIPT_CONFIG.margin - 50, 20, { align: 'right' });
        pdf.text(`Ref: ${userPrefix}-${receipt.shipmentId}`, RECEIPT_CONFIG.pageWidth - RECEIPT_CONFIG.margin - 50, 27, { align: 'right' });
        
        yPos = 60;
        
        // 4. Receipt Title
        pdf.setTextColor(...RECEIPT_CONFIG.colors.text);
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        pdf.text('PAYMENT RECEIPT', RECEIPT_CONFIG.margin, yPos);
        yPos += 12;
        
        // 5. Payment Status Badge
        pdf.setFillColor(...RECEIPT_CONFIG.colors.success);
        pdf.rect(RECEIPT_CONFIG.margin, yPos - 4, 40, 8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.text('✓ PAID', RECEIPT_CONFIG.margin + 2, yPos + 2);
        
        yPos += 15;
        
        // 6. Shipment Details Section
        pdf.setTextColor(...RECEIPT_CONFIG.colors.text);
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(10);
        pdf.text('SHIPMENT DETAILS', RECEIPT_CONFIG.margin, yPos);
        yPos += 7;
        
        // Draw section box
        pdf.setDrawColor(...RECEIPT_CONFIG.colors.border);
        pdf.rect(RECEIPT_CONFIG.margin, yPos - 5, pageWidth, 50);
        
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(...RECEIPT_CONFIG.colors.textLight);
        
        const details = [
            ['Booking ID:', `${userPrefix}-${receipt.shipmentId}`],
            ['Ship Name:', receipt.shipName || receipt.vessel_name || 'TBD'],
            ['Route:', `${receipt.source_port || receipt.origin} → ${receipt.destination_port || receipt.destination}`],
            ['Cargo Type:', receipt.cargoType || 'General Cargo'],
            ['Status:', 'Cargo Ready for Loading']
        ];
        
        let detailY = yPos;
        details.forEach(([label, value]) => {
            pdf.text(label, RECEIPT_CONFIG.margin + 3, detailY);
            pdf.setTextColor(...RECEIPT_CONFIG.colors.text);
            pdf.setFont(undefined, 'bold');
            pdf.text(value, RECEIPT_CONFIG.margin + 50, detailY);
            pdf.setTextColor(...RECEIPT_CONFIG.colors.textLight);
            pdf.setFont(undefined, 'normal');
            detailY += 8;
        });
        
        yPos += 60;
        
        // 7. Payment Information
        pdf.setTextColor(...RECEIPT_CONFIG.colors.text);
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(10);
        pdf.text('PAYMENT INFORMATION', RECEIPT_CONFIG.margin, yPos);
        yPos += 7;
        
        // Payment table
        const paymentData = [
            ['Description', 'Amount'],
            ['Shipment Charges', `$${(receipt.amount || 0).toFixed(2)}`],
            ['Tax (0%)', '$0.00'],
            ['Total Paid', `$${(receipt.amount || 0).toFixed(2)}`]
        ];
        
        let payY = yPos;
        paymentData.forEach((row, idx) => {
            if (idx === 0) {
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(255, 255, 255);
                pdf.setFillColor(...RECEIPT_CONFIG.colors.primary);
                pdf.rect(RECEIPT_CONFIG.margin, payY - 4, pageWidth, 6, 'F');
            } else {
            if (idx === paymentData.length - 1) {
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(...RECEIPT_CONFIG.colors.primary);
            } else {
                pdf.setFont(undefined, 'normal');
                pdf.setTextColor(...RECEIPT_CONFIG.colors.text);
            }
            }
            
            pdf.text(row[0], RECEIPT_CONFIG.margin + 3, payY);
            pdf.text(row[1], RECEIPT_CONFIG.pageWidth - RECEIPT_CONFIG.margin - 3, payY, { align: 'right' });
            payY += 7;
        });
        
        yPos = payY + 10;
        
        // 8. Transaction ID
        pdf.setTextColor(...RECEIPT_CONFIG.colors.textLight);
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'normal');
        pdf.text(`Transaction ID: ${receipt.transactionId || 'N/A'}`, RECEIPT_CONFIG.margin, yPos);
        yPos += 5;
        pdf.text(`Date: ${new Date(receipt.receiptDate).toLocaleString('en-GB')}`, RECEIPT_CONFIG.margin, yPos);
        
        // 9. Footer
        yPos = RECEIPT_CONFIG.pageHeight - 40;
        pdf.setDrawColor(...RECEIPT_CONFIG.colors.border);
        pdf.line(RECEIPT_CONFIG.margin, yPos, RECEIPT_CONFIG.pageWidth - RECEIPT_CONFIG.margin, yPos);
        
        yPos += 5;
        pdf.setTextColor(...RECEIPT_CONFIG.colors.textLight);
        pdf.setFontSize(7);
        pdf.text('This is an electronically generated receipt. No signature is required.', RECEIPT_CONFIG.pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        pdf.text('For support, contact: support@smartshipping.io | +1-800-SHIP-NOW', RECEIPT_CONFIG.pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        pdf.text('© 2026 Smart Shipping Enterprise. All rights reserved.', RECEIPT_CONFIG.pageWidth / 2, yPos, { align: 'center' });
        
        // 10. Download PDF
        const fileName = `Receipt-${userPrefix}-${receipt.shipmentId}-${new Date().getTime()}.pdf`;
        pdf.save(fileName);
        
        showToast('Receipt downloaded successfully!', 'success');
        
    } catch (err) {
        console.error('Receipt download error:', err);
        showToast('Failed to download receipt', 'error');
    }
}

/**
 * Fallback HTML-based receipt if jsPDF not available
 */
function downloadReceiptHTML(receipt) {
    const userPrefix = receipt.user_prefix || 'SS';
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt-${userPrefix}-${receipt.shipmentId}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .receipt { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; margin: -40px -40px 30px -40px; }
                .header h1 { margin: 0; font-size: 24px; }
                .header p { margin: 5px 0 0 0; opacity: 0.9; }
                .status-badge { display: inline-block; background: #22c55e; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin: 20px 0; }
                .section { margin: 20px 0; }
                .section h2 { font-size: 14px; font-weight: bold; color: #1e1e1e; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
                .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .detail-item { }
                .detail-label { color: #888; font-size: 12px; font-weight: bold; text-transform: uppercase; }
                .detail-value { color: #1e1e1e; font-weight: bold; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th { background: #3b82f6; color: white; padding: 10px; text-align: left; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                tr:last-child td { border-bottom: none; }
                .total-row { background: #f9fafb; font-weight: bold; }
                .footer { color: #888; font-size: 11px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>⚓ SMART SHIPPING</h1>
                    <p>Global Logistics Partner | Enterprise Shipping Solutions</p>
                </div>
                <h2>Payment Receipt</h2>
                <div class="status-badge">✓ PAID</div>
                
                <div class="section">
                    <h2>Shipment Details</h2>
                    <div class="details">
                        <div class="detail-item">
                            <div class="detail-label">Booking ID</div>
                            <div class="detail-value">${userPrefix}-${receipt.shipmentId}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Ship Name</div>
                            <div class="detail-value">${receipt.shipName || 'TBD'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Route</div>
                            <div class="detail-value">${receipt.source_port || 'Origin'} → ${receipt.destination_port || 'Destination'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Cargo Type</div>
                            <div class="detail-value">${receipt.cargoType || 'General Cargo'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Payment Information</h2>
                    <table>
                        <tr>
                            <th>Description</th>
                            <th style="text-align: right;">Amount</th>
                        </tr>
                        <tr>
                            <td>Shipment Charges</td>
                            <td style="text-align: right;">$${(receipt.amount || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td>Tax (0%)</td>
                            <td style="text-align: right;">$0.00</td>
                        </tr>
                        <tr class="total-row">
                            <td>Total Paid</td>
                            <td style="text-align: right;">$${(receipt.amount || 0).toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
                
                <div class="section">
                    <div class="detail-item">
                        <div class="detail-label">Transaction ID</div>
                        <div class="detail-value">${receipt.transactionId || 'N/A'}</div>
                    </div>
                    <div class="detail-item" style="margin-top: 10px;">
                        <div class="detail-label">Date</div>
                        <div class="detail-value">${new Date(receipt.receiptDate).toLocaleString('en-GB')}</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>This is an electronically generated receipt. No signature is required.</p>
                    <p>For support, contact: support@smartshipping.io | +1-800-SHIP-NOW</p>
                    <p>© 2026 Smart Shipping Enterprise. All rights reserved.</p>
                </div>
            </div>
            <script>
                window.print();
            </script>
        </body>
        </html>
    `;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt-${userPrefix}-${receipt.shipmentId}-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Helper function to show toast notifications
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}
