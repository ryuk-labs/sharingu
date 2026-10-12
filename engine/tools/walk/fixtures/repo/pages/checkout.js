export default (plan) => `<main><h1>Checkout</h1><p>${plan.name}</p><form method="POST" action="/api/orders"><button>Pay</button></form></main>`;
