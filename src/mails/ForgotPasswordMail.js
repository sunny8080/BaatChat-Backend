import Mailgen from 'mailgen';

const mailGenerator = new Mailgen({
  theme: 'default',
  product: {
    name: 'BaatChat',
    link: process.env.FED_URL,
    logo: 'https://baatchat.online/logo.png', // replace with your hosted logo URL
    logoHeight: '40px',
    copyright: `© ${new Date().getFullYear()} BaatChat · baatchat.online · Made with ❤️ in India 🇮🇳`,
  },
});

/**
 * Generates HTML and plain text password reset email content.
 *
 * @param {string} name - Recipient's display name.
 * @param {string} resetURL - Password reset link to include in the email.
 * @param {number} [expiresInMinutes=10] - Number of minutes before the reset link expires.
 * @returns {{html: string, text: string, resetURL: string}} Rendered email content and reset link.
 */
const ForgotPasswordMail = (name, resetURL, expiresInMinutes = 10) => {
  const email = {
    body: {
      name: name,
      intro: ['We received a request to reset your <strong>BaatChat</strong> account password.', 'If you made this request, click the button below to reset your password. This link will expire in <strong>' + expiresInMinutes + ' minutes</strong>.'],
      action: {
        instructions: 'Click the button below to choose a new password for your account:',
        button: {
          color: '#7C3AED',
          text: 'Reset my password',
          link: resetURL,
        },
      },
      table: {
        data: [
          {
            item: '🔗 Reset Link',
            description: `<a href="${resetURL}" style="color:#7C3AED;word-break:break-all">${resetURL}</a>`,
          },
          {
            item: '⏱ Link expires',
            description: `${expiresInMinutes} minutes from now`,
          },
          {
            item: '📍 Requested from',
            description: 'baatchat.online — password reset flow',
          },
        ],
        columns: {
          customWidth: { item: '30%', description: '70%' },
          customAlignment: { item: 'left', description: 'left' },
        },
      },
      outro: ['If you did <strong>not</strong> request a password reset, please ignore this email — your password will remain unchanged.', '<strong>Never share this link with anyone.</strong> BaatChat support will never ask for your reset link.', "If you need further help, reach us at <a href='mailto:support@baatchat.online'>support@baatchat.online</a>", '... . -.-. ..- .-. .. - -.--   ..-. .. .-. ... -   (decode this morse 🔐)'],
      signature: 'Team BaatChat',
    },
  };

  const htmlEmail = mailGenerator.generate(email);
  const textEmail = mailGenerator.generatePlaintext(email);

  return { html: htmlEmail, text: textEmail, resetURL };
};

export default ForgotPasswordMail;
