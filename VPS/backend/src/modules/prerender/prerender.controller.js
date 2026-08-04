const { renderProductPageHtml } = require("./prerender.service");

async function prerenderProductPage(req, res, next) {
  try {
    const { status, html } = await renderProductPageHtml(req.params.slug);
    res.status(status).type("html").send(html);
  } catch (error) {
    next(error);
  }
}

module.exports = { prerenderProductPage };
