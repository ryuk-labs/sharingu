export default (prices) => `<main><h1>Plans</h1>${prices.map((p) => `<section><h2>${p.name}</h2><p>${p.eur} EUR</p></section>`).join("")}<a href="/checkout">Choose</a></main>`;
