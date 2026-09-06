export type IncidentType =
  | 'sent-money'
  | 'shared-secret'
  | 'installed-app'
  | 'clicked-link'
  | 'shared-information'

export type IncidentConfig = {
  id: IncidentType
  title: string
  shortLabel: string
  description: string
  checklist: string[]
  evidence: string[]
  reportingLinks: { label: string; href: string }[]
}

export type IncidentMetadata = {
  incidentType: IncidentType
  timeline: string
  transactionReference: string
  createdAt: string
}

export const INCIDENT_CONFIG: Record<IncidentType, IncidentConfig> = {
  'sent-money': {
    id: 'sent-money',
    title: 'Sent money',
    shortLabel: 'Sent money',
    description: 'Prioritize stopping or reporting the transfer through the official channel you already trust.',
    checklist: ['Contact the payment provider using its official app or website.', 'Ask whether the transfer can be recalled, frozen, or reviewed.', 'Change the password for the affected account from a known-safe device if you suspect access.', 'Monitor the account for additional unexpected activity.'],
    evidence: ['Transfer confirmation and timestamp', 'Recipient details as shown in the payment app', 'Messages, email headers, or call details that led to the payment', 'Any case or reference number from the provider'],
    reportingLinks: [{ label: 'National cybercrime reporting portal', href: 'https://cybercrime.gov.in/' }, { label: 'Call 1930 — cyber fraud helpline', href: 'https://cybercrime.gov.in/' }],
  },
  'shared-secret': {
    id: 'shared-secret',
    title: 'Shared an OTP, PIN, password, or recovery code',
    shortLabel: 'Shared a secret',
    description: 'Treat the shared secret as exposed. Use only official account recovery and security controls.',
    checklist: ['Change the affected password from the official account settings page.', 'Revoke active sessions and review recent sign-ins.', 'Replace recovery codes or reset the affected security factor.', 'Contact the official provider if you see account changes you did not make.'],
    evidence: ['Time and channel where the secret was requested', 'Security alerts or sign-in notifications', 'Account-change notifications', 'Provider case or reference number'],
    reportingLinks: [{ label: 'National cybercrime reporting portal', href: 'https://cybercrime.gov.in/' }, { label: 'RBI guidance on customer protection', href: 'https://www.rbi.org.in/' }],
  },
  'installed-app': {
    id: 'installed-app',
    title: 'Installed a suspicious application',
    shortLabel: 'Installed an app',
    description: 'Reduce exposure before investigating the application. Do not enter credentials into it.',
    checklist: ['Disconnect the device from sensitive accounts while you assess it.', 'Remove the suspicious application using the device’s normal uninstall controls.', 'Run the device’s built-in security check and install pending system updates.', 'Change important passwords from a different trusted device if credentials were entered.'],
    evidence: ['Application name, publisher, and install time', 'App-store or download-page address', 'Permission prompts or security alerts', 'Device security scan result'],
    reportingLinks: [{ label: 'Google Play Protect help', href: 'https://support.google.com/googleplay/answer/2812853' }, { label: 'National cybercrime reporting portal', href: 'https://cybercrime.gov.in/' }],
  },
  'clicked-link': {
    id: 'clicked-link',
    title: 'Clicked a suspicious link',
    shortLabel: 'Clicked a link',
    description: 'Avoid returning to the link. Assess whether credentials or files were submitted and use official sites directly.',
    checklist: ['Close the suspicious page and do not download or submit anything else.', 'If credentials were entered, change them from the official site using a new tab.', 'Review recent account activity and active sessions.', 'Run the browser or device security check if a file downloaded.'],
    evidence: ['Full link copied as text, without opening it again', 'Time and app where it appeared', 'Screenshots of the message or page', 'Any download name or security warning'],
    reportingLinks: [{ label: 'Report a phishing page to Google Safe Browsing', href: 'https://safebrowsing.google.com/safebrowsing/report_phish/' }, { label: 'National cybercrime reporting portal', href: 'https://cybercrime.gov.in/' }],
  },
  'shared-information': {
    id: 'shared-information',
    title: 'Shared personal information',
    shortLabel: 'Shared information',
    description: 'Limit further disclosure and watch for follow-up impersonation or account-recovery attempts.',
    checklist: ['Stop replying and avoid confirming any additional details.', 'Review privacy and account-recovery settings for exposed accounts.', 'Tell your trusted contact what was shared so they can recognize follow-up attempts.', 'Use official support channels if the information could affect an account or service.'],
    evidence: ['Type of information shared, without copying the value', 'Time and channel of the request', 'Screenshots or message headers', 'Any follow-up request or case number'],
    reportingLinks: [{ label: 'Report identity fraud to the national portal', href: 'https://cybercrime.gov.in/' }, { label: 'RBI — report unauthorized transactions', href: 'https://www.rbi.org.in/' }],
  },
}

const INCIDENT_STORAGE_KEY = 'trustpause.aftertap.incidents.v1'

export function saveIncidentMetadata(metadata: IncidentMetadata) {
  if (typeof window === 'undefined') return
  try {
    const current = JSON.parse(window.localStorage.getItem(INCIDENT_STORAGE_KEY) ?? '[]')
    const incidents = Array.isArray(current) ? current.filter((item) => item && typeof item === 'object') : []
    window.localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify([...incidents, metadata].slice(-20)))
  } catch {
    // Local storage is optional; the workflow remains usable if it is unavailable.
  }
}

export function buildIncidentSummary(metadata: IncidentMetadata) {
  const config = INCIDENT_CONFIG[metadata.incidentType]
  return [
    'TrustPause AfterTap Rescue summary',
    `Incident: ${config.title}`,
    `Timeline: ${metadata.timeline || 'Not provided'}`,
    `Transaction reference: ${metadata.transactionReference || 'Not provided'}`,
    '',
    'Important: TrustPause cannot reverse a transaction or contact a bank, provider, or authority automatically.',
    '',
    'Preserve evidence:',
    ...config.evidence.map((item) => `- ${item}`),
    '',
    'Use official reporting channels that you open independently.',
  ].join('\n')
}
