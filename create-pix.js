// netlify/functions/create-pix.js
//
// Cria um pagamento Pix via API da PayShark.
// A chave privada (PAYSHARK_API_KEY) fica em variavel de ambiente no Netlify,
// nunca no codigo do checkout. O front-end (index.html) so chama esta function.

const API_URL = 'https://api.gatewaypayshark.com.br/v1/payment';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo nao permitido.' }) };
  }

  const API_KEY = process.env.PAYSHARK_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'PAYSHARK_API_KEY nao configurada no ambiente.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalido no corpo da requisicao.' }) };
  }

  const { nome, email, cpf, celular, valor, itens } = payload;

  if (!nome || !email || !cpf || !valor) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Dados obrigatorios faltando (nome, email, cpf, valor).' }) };
  }

  // valor esperado em reais (ex: 297.00) -> converte para centavos (inteiro)
  const amountCents = Math.round(Number(valor) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valor invalido.' }) };
  }

  const cpfLimpo = String(cpf).replace(/\D/g, '');
  const celularLimpo = celular ? String(celular).replace(/\D/g, '') : undefined;
  const nomeProduto = (itens && itens[0] && itens[0].nome) || 'ECG + Procedimentos + Gasometria + Antibióticos + Guia de Prescrições por 2 anos';

  const host = event.headers?.host;
  const notificationUrl = host ? `https://${host}/.netlify/functions/pix-webhook` : undefined;

  const body = {
    amount: amountCents,
    currency: 'BRL',
    method: 'PIX',
    description: nomeProduto,
    externalRef: `order_${Date.now()}`,
    notificationUrl,
    payer: {
      name: nome,
      taxId: cpfLimpo,
      email: email,
      phone: celularLimpo,
    },
    items: [
      {
        quantity: 1,
        name: nomeProduto,
        price: amountCents,
        type: 'DIGITAL',
      },
    ],
  };

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data.message || 'Erro ao criar pagamento Pix.', details: data }),
      };
    }

    // Formato confirmado na documentacao da PayShark: id e status ficam na raiz,
    // o codigo Pix copia-e-cola fica em data.copypaste
    console.log('RAW PAYSHARK RESPONSE:', JSON.stringify(data));

    const id = data.id;
    const status = data.status;
    const qrCode = data.data?.copypaste;

    if (!qrCode) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Pix criado, mas nao encontrei o codigo Pix (data.copypaste) na resposta.', details: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id, qrCode, status }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Falha ao comunicar com o gateway.', details: String(err) }),
    };
  }
};
