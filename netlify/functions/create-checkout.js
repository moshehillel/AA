const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { amount, customerName, paymentMethod } = JSON.parse(event.body);

    // Validate required fields
    if (!amount || !paymentMethod) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Amount and payment method are required' })
      };
    }

    // Determine payment method types based on selection
    let paymentMethodTypes = [];
    switch(paymentMethod) {
      case 'card':
        paymentMethodTypes = ['card'];
        break;
      case 'klarna':
        paymentMethodTypes = ['klarna'];
        break;
      case 'affirm':
        paymentMethodTypes = ['affirm'];
        break;
      case 'bank':
        paymentMethodTypes = ['us_bank_account'];
        break;
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid payment method' })
        };
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Payment for ${customerName || 'Customer'}`,
              description: 'Invoice payment',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.URL || 'https://advancedautomations.net'}/payment.html?success=true`,
      cancel_url: `${process.env.URL || 'https://advancedautomations.net'}/payment.html?canceled=true`,
      customer_email: customerName ? `${customerName.toLowerCase().replace(/\s+/g, '.')}@example.com` : undefined,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };

  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
