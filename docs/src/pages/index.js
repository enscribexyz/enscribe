import EnscribeLandingPage from "../components/EnscribeLandingPage"
import Head from "@docusaurus/Head"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import useBaseUrl from "@docusaurus/useBaseUrl"

// Custom page without Docusaurus Layout - this completely removes the header and footer
export default function Home() {
  const { siteConfig } = useDocusaurusContext()

  return (
    // Note: We're not using the Layout component at all here
      <EnscribeLandingPage />
  )
}


