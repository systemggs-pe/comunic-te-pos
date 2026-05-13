function valueOrEmpty(value) {
  const text = String(value || "").trim();
  if (!text || text.includes("*") || /^data in credit$/i.test(text)) return "";
  return text;
}

function normalizeReniecResponse(data, dni) {
  const result = data?.result || data?.data || data?.persona || data || {};
  const nombres = valueOrEmpty(result.nombres || result.first_name);
  const apellidoPaterno = valueOrEmpty(result.apellidoPaterno || result.apellido_paterno || result.first_last_name);
  const apellidoMaterno = valueOrEmpty(result.apellidoMaterno || result.apellido_materno || result.second_last_name);
  const fullName = valueOrEmpty(
    result.full_name ||
    result.nombreCompleto ||
    result.nombre_completo ||
    [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean).join(" "),
  );

  return {
    success: Boolean(data?.success ?? fullName),
    source: data?.source || "RENIEC",
    result: {
      ...result,
      document_number: valueOrEmpty(result.document_number || result.dni || dni),
      first_name: nombres,
      first_last_name: apellidoPaterno,
      second_last_name: apellidoMaterno,
      full_name: fullName,
      address: valueOrEmpty(result.address || result.direccion),
      phone: valueOrEmpty(result.phone || result.telefono),
      email: valueOrEmpty(result.email || result.correo),
    },
  };
}

async function consultarReniecHandler(req, res) {
  const dni = String(req.body?.dni || "").replace(/\D/g, "").slice(0, 8);
  if (dni.length !== 8) {
    res.status(400).json({error: "DNI invalido"});
    return;
  }

  if (!process.env.RENIEC_TOKEN) {
    res.status(500).json({error: "RENIEC_TOKEN_MISSING"});
    return;
  }

  try {
    const response = await fetch(`https://api-codart.cgrt.org/api/v1/consultas/reniec/dni/${dni}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RENIEC_TOKEN}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(response.status).json({
        error: data.error || data.message || "RENIEC_UPSTREAM_ERROR",
        success: false,
      });
      return;
    }

    res.status(200).json(normalizeReniecResponse(data, dni));
  } catch (error) {
    res.status(502).json({
      error: "RENIEC_UNAVAILABLE",
      message: error.message,
      success: false,
    });
  }
}

module.exports = {consultarReniecHandler};
