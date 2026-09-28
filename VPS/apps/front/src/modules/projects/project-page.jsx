import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePublicSettings } from "../settings/public-settings-context";
import { StorefrontLoadingState } from "../../shared/storefront/storefront-ui";
import { getProject } from "./projects.api";
import { ProjectEnquiryForm } from "./project-enquiry-form";
import {
  BRAND, sectionStyle, SectionTitle, Hero, ProblemSolution, Steps, Packages, Gallery, ChipList, WhyUs, Faqs
} from "./project-sections";

// /projects/:slug — one custom IoT project, sold on quotation (2026-09-28).

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
  el.setAttribute("content", content || "");
}

function useProjectSeo(project) {
  useEffect(() => {
    if (!project) return undefined;
    const prevTitle = document.title;
    document.title = project.seoTitle || `${project.title} | Jenix India`;
    setMeta("description", project.seoDescription || project.summary || project.tagline);
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Service",
      name: project.title,
      description: project.seoDescription || project.summary,
      image: project.heroImageUrl || undefined,
      url: window.location.href.split("?")[0],
      areaServed: "IN",
      provider: { "@type": "Organization", name: "Jenix India", url: "https://jenixindia.com" },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: `${project.title} packages`,
        itemListElement: (project.packages || []).map((pk) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: `${project.title} — ${pk.name}`, description: pk.tagline } }))
      }
    });
    document.head.appendChild(ld);
    return () => { document.title = prevTitle; ld.remove(); };
  }, [project]);
}

export function ProjectPage() {
  const { slug } = useParams();
  const { settings } = usePublicSettings();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [packageInterest, setPackageInterest] = useState("");
  const formRef = useRef(null);

  const contact = settings?.contactInformation || {};
  const whatsappNumber = contact.publicWhatsApp || settings?.storeProfile?.whatsappNumber || "917240226566";

  useEffect(() => {
    let alive = true;
    setLoading(true); setNotFound(false);
    getProject(slug)
      .then((p) => { if (alive) setProject(p); })
      .catch(() => { if (alive) setNotFound(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  useProjectSeo(project);

  const onQuote = (pkgName) => {
    if (pkgName) setPackageInterest(pkgName);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) return <main className="proto-main-shell"><StorefrontLoadingState label="Loading project..." /></main>;
  if (notFound || !project) {
    return (
      <main className="proto-main-shell" style={{ maxWidth: 560, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>Project not found</h1>
        <Link to="/projects" style={{ color: BRAND, fontWeight: 700 }}>See all projects →</Link>
      </main>
    );
  }

  const whatsappHref = `https://wa.me/${String(whatsappNumber).replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi Jenix, I'm interested in: ${project.title}. Please share details.`)}`;

  return (
    <main style={{ background: "#f8fafc", paddingBottom: 40 }}>
      <Hero project={project} onQuote={onQuote} whatsappHref={whatsappHref} />
      <ProblemSolution project={project} />
      <Steps steps={project.steps} />
      <Packages packages={project.packages} onQuote={onQuote} />
      <Gallery items={project.gallery} />
      <ChipList kicker="SOFTWARE" title="Software features" items={project.softwareFeatures} />
      <ChipList kicker="WHERE IT'S USED" title="Ideal for" items={project.useCases} icon="🏢" />
      <WhyUs items={project.whyUs} />
      <Faqs faqs={project.faqs} />

      <section ref={formRef} id="quote" style={{ ...sectionStyle, scrollMarginTop: 90 }}>
        <SectionTitle kicker="GET A QUOTATION" title="Tell us about your site"
          lead="Every site is different, so we quote each project individually. Share a few details and our project team will contact you." />
        <ProjectEnquiryForm project={project} packageInterest={packageInterest} onPackageChange={setPackageInterest} whatsappNumber={whatsappNumber} />
      </section>

      <section style={{ ...sectionStyle, textAlign: "center" }}>
        <Link to="/projects" style={{ color: BRAND, fontWeight: 700, textDecoration: "none" }}>← All projects</Link>
      </section>
    </main>
  );
}
