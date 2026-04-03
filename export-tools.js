// Universal Export Tools for Smart Shipping Platform
// Handles CSV, DOCX, and PDF generation from JSON data.

if (!window.jspdf) {
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(s1);
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js';
    document.head.appendChild(s2);
}

const ExportTools = {
    downloadCSV: function(data, filename) {
        if (!data || !data.length) return alert('No data to export.');
        const headers = Object.keys(data[0]);
        let csvContent = headers.join(',') + '\n';
        
        data.forEach(row => {
            let values = headers.map(header => {
                let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            csvContent += values.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        this._downloadBlob(blob, `${filename}.csv`);
    },

    downloadDOCX: function(data, filename, title = "Statement Report") {
        if (!data || !data.length) return alert('No data to export.');
        const headers = Object.keys(data[0]);
        
        let tableHtml = `<table border="1" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px;">`;
        tableHtml += `<thead><tr><th colspan="${headers.length}" style="text-align:center; padding:10px; font-size:16px; background-color:#eaeaea;">${title}</th></tr><tr>`;
        headers.forEach(h => { tableHtml += `<th style="padding:8px; background-color:#f0f0f0;">${h}</th>`; });
        tableHtml += `</tr></thead><tbody>`;
        
        data.forEach(row => {
            tableHtml += `<tr>`;
            headers.forEach(h => { tableHtml += `<td style="padding:6px;">${row[h] !== null && row[h] !== undefined ? row[h] : ''}</td>`; });
            tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table>`;

        const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>`;
        const footer = `</body></html>`;
        const html = header + tableHtml + footer;

        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        this._downloadBlob(blob, `${filename}.doc`);
    },

    downloadPDF: function(data, filename, title = "Statement Report") {
        if (!data || !data.length) return alert('No data to export.');
        if (!window.jspdf) return alert('PDF Library is still loading, please try again in a few seconds.');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        
        const headers = Object.keys(data[0]);
        const rows = data.map(d => headers.map(h => d[h] !== null && d[h] !== undefined ? String(d[h]) : ''));

        doc.setFontSize(16);
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text('Generated on: ' + new Date().toLocaleString(), 14, 22);

        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185] }
        });

        doc.save(`${filename}.pdf`);
    },

    _downloadBlob: function(blob, filename) {
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
};

window.ExportTools = ExportTools;
