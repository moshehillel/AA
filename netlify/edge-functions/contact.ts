import type { Context } from "https://edge.cloudflare.com";

export default async function (request: Request, context: Context) {
  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const data = await request.json();
    const { name, email, message, subject } = data;

    // Validate required fields
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Name, email, and message are required" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Here you would typically send an email using a service like:
    // - SendGrid
    // - Resend
    // - AWS SES
    // - Or store in a database
    
    // For now, we'll log the submission and return success
    console.log("Contact form submission:", {
      name,
      email,
      subject: subject || "Contact Form Submission",
      message,
      timestamp: new Date().toISOString()
    });

    // Send email using a service (example with environment variables)
    // You would need to configure the actual email service
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Thank you for your message. We'll get back to you soon!" 
      }),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Contact form error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
