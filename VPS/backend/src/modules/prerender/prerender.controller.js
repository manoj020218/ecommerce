const {
  renderProductPageHtml,
  renderCategoryPageHtml,
  renderBlogPageHtml,
  renderJobVacancyPageHtml
} = require("./prerender.service");

async function prerenderProductPage(req, res, next) {
  try {
    const { status, html } = await renderProductPageHtml(req.params.slug);
    res.status(status).type("html").send(html);
  } catch (error) {
    next(error);
  }
}

async function prerenderCategoryPage(req, res, next) {
  try {
    const { status, html } = await renderCategoryPageHtml(req.params.slug);
    res.status(status).type("html").send(html);
  } catch (error) {
    next(error);
  }
}

async function prerenderBlogPage(req, res, next) {
  try {
    const { status, html } = await renderBlogPageHtml(req.params.slug);
    res.status(status).type("html").send(html);
  } catch (error) {
    next(error);
  }
}

async function prerenderJobVacancyPage(req, res, next) {
  try {
    const { status, html } = await renderJobVacancyPageHtml(req.params.slug);
    res.status(status).type("html").send(html);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  prerenderProductPage,
  prerenderCategoryPage,
  prerenderBlogPage,
  prerenderJobVacancyPage
};
