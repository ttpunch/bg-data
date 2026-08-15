export const UNSUPPORTED_TEXT =
  "I can only record breakdown reports and machine details right now. Try describing a machine fault, or a machine's name, location, and specifications.";

const REQUIRED = {
  breakdown: ["mcdata", "bgdetail"],
  machine_details: ["machine_no"],
};

const filled = (value) => typeof value === "string" && value.trim() !== "";

export const buildSavePayload = (interpretation) => {
  const { intent, fields } = interpretation;

  if (intent === "breakdown") {
    return {
      path: "/api/submit-form",
      payload: {
        mcdata: fields.mcdata,
        bgdetail: fields.bgdetail,
        bgdate: fields.bgdate,
      },
    };
  }

  if (intent === "machine_details") {
    return {
      path: "/api/machine-details",
      payload: {
        machine_no: fields.machine_no,
        machine_name: fields.machine_name,
        location: fields.location,
        specifications: fields.specifications ?? [],
      },
    };
  }

  return null;
};

export const canSave = (interpretation) => {
  const required = REQUIRED[interpretation.intent];
  if (!required) return false;
  return required.every((name) => filled(interpretation.fields[name]));
};

export const agentReplyText = (interpretation) => {
  if (interpretation.intent === "clarify") return interpretation.clarifyQuestion;
  if (interpretation.intent === "unsupported") return UNSUPPORTED_TEXT;
  return "";
};
