// Email texts. English for now (users have no language preference yet).
export const otpEmail = ({ name, code, minutes }) => ({
  subject: "Your NagarSetu verification code",
  text: `Hello ${name},\n\nYour NagarSetu verification code is: ${code}\n\nIt expires in ${minutes} minutes. If you did not sign up, ignore this email.\n\nNagarSetu is a college prototype, not an official government platform.`,
});

export const resetEmail = ({ name, link, minutes }) => ({
  subject: "Reset your NagarSetu password",
  text: `Hello ${name},\n\nTo choose a new password, open this link within ${minutes} minutes:\n\n${link}\n\nIt works once. If you did not ask for this, ignore this email; your password stays the same.\n\nNagarSetu is a college prototype, not an official government platform.`,
});
