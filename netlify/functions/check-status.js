// netlify/functions/check-status.js
//
// Consulta o status de um pagamento Pix ja criado, pelo id.
// Usada pelo checkout (polling a cada 5s) para saber quando o pagamento foi confirmado.
//
// Rota confirmada na documentacao da PayShark: GET /v1/payment/:id

const API_BASE = 'https://api.gatewaypayshark.com.br/v1/payment';

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Metodo nao permitido.' }) };
  }

  const API_KEY = process.env.PAYSHARK_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'PAYSHARK_API_KEY nao configurada no ambiente.' }) };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Parametro "id" e obrigatorio.' }) };
  }

  try {
    const resp = await fetch(`${API_BASE}/${id}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + API_KEY,
        Accept: 'application/json',
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data.message || 'Erro ao consultar pagamento.', details: data }),
      };
    }

    console.log('RAW PAYSHARK STATUS RESPONSE:', JSON.stringify(data));

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: data.id,
        status: data.status, // PENDING | PROCESSING | PAID | REFUSED | REFUNDED | MED | CHARGEBACK
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Falha ao comunicar com o gateway.', details: String(err) }),
    };
  }
};
