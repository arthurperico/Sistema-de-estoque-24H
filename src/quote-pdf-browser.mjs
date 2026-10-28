import { buildQuotePdfFilename, createQuotePdf } from './worker-quotes.mjs';

function normalizeQuoteId(value) {
    const quoteId = Number(value);
    if (!Number.isInteger(quoteId) || quoteId <= 0) {
        throw new Error('Orçamento sem identificador válido.');
    }
    return quoteId;
}

async function fetchQuote(quoteId) {
    const response = await fetch(`/api/orcamentos/${quoteId}`, { credentials: 'include' });
    if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Sua sessão expirou. Entre novamente para gerar o PDF.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.quote) {
        throw new Error(data.error || 'Não foi possível carregar o orçamento.');
    }
    return data.quote;
}

async function generateQuotePdfBlob(quote) {
    const request = new Request(window.location.origin, { method: 'GET' });
    const env = {
        ASSETS: {
            fetch: (assetRequest) => fetch(assetRequest, { credentials: 'same-origin' })
        }
    };
    const pdfBytes = await createQuotePdf(quote, request, env);
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

async function loadQuotePdf(quoteId, quoteOverrides = {}) {
    const normalizedQuoteId = normalizeQuoteId(quoteId);
    const quote = {
        ...(await fetchQuote(normalizedQuoteId)),
        ...quoteOverrides
    };
    const blob = await generateQuotePdfBlob(quote);
    if (!blob.size) throw new Error('O PDF gerado está vazio.');
    return { blob, filename: buildQuotePdfFilename(quote) };
}

async function downloadQuotePdf(quoteId, quoteOverrides = {}) {
    const { blob, filename } = await loadQuotePdf(quoteId, quoteOverrides);
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    try {
        downloadLink.click();
    } finally {
        downloadLink.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
}

async function renderQuotePdfInCurrentPage(quoteId) {
    const { blob, filename } = await loadQuotePdf(quoteId);
    document.title = filename;
    const objectUrl = URL.createObjectURL(blob);
    window.location.replace(objectUrl);
}

window.QuotePdfClient = Object.freeze({
    downloadQuotePdf,
    generateQuotePdfBlob,
    loadQuotePdf,
    renderQuotePdfInCurrentPage
});

const bootstrapQuoteId = document.body?.dataset?.quotePdfId;
if (bootstrapQuoteId) {
    downloadQuotePdf(bootstrapQuoteId)
        .then(() => {
            document.body.textContent = 'Download do PDF iniciado. Você já pode fechar esta aba.';
        })
        .catch((error) => {
            console.error(error);
            document.body.textContent = error instanceof Error
                ? error.message
                : 'Não foi possível gerar o PDF.';
        });
}
