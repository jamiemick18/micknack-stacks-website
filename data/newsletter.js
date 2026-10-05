// ============================================================================
// NEWSLETTER — where the "Join the Menace List" signup form sends emails.
// ============================================================================
//
// Create a free account with an email service (Buttondown, MailerLite, Mailchimp,
// Kit...), make a signup form, and paste its form "action" URL below. The email
// service stores the addresses, sends the confirmation / welcome email, and adds
// the unsubscribe link.
//
//   Buttondown: https://buttondown.com/api/emails/embed-subscribe/YOUR-USERNAME
//   Mailchimp:  the action="..." URL from Audience > Signup forms > Embedded forms
//
// "emailField" is the name of the email input the service expects. Buttondown
// uses "email"; Mailchimp uses "EMAIL".
//
// Until `action` is filled in, the signup form stays hidden on the live site (it
// still shows when you open the site locally, so you can see it).

window.MICKNACK_NEWSLETTER = {
  action: "",
  emailField: "email",
};
