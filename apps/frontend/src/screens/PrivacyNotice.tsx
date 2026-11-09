import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_APP_BACKEND_URL ?? 'http://localhost:3000';

interface NoticeField {
  field: string;
  purpose: string | null;
  basis: string | null;
  collected: boolean;
  note: string;
}

interface Notice {
  version: string;
  controller: string;
  contact: string;
  automatedDecisionMaking: boolean;
  directMarketing: boolean;
  fields: NoticeField[];
  legitimateInterest: {
    purposeTest: string;
    necessityTest: string;
    balancingTest: string;
  };
  recipients: Array<{ name: string; role: string; when: string; region: string }>;
  retention: Record<string, string>;
  transfer: { accountStore: string; note: string };
  complaints: string[];
  rights: string[];
}

export const PrivacyNotice = () => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${BACKEND_URL}/v1/privacy/notice`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Notice unavailable');
        setNotice((await response.json()) as Notice);
      })
      .catch(() => setError('The privacy notice could not be loaded.'));
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 text-textMain">
      <Link className="text-green-500" to="/login">
        Back to sign in
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-2">Privacy notice</h1>
      {error && <p>{error}</p>}
      {notice && (
        <div className="flex flex-col gap-6">
          <p>
            {notice.controller} is the controller. Contact {notice.contact}. Policy version {notice.version}. Account
            data is stored in {notice.transfer.accountStore}.
          </p>
          <p>{notice.transfer.note}</p>
          <section>
            <h2 className="text-xl font-semibold mb-2">What we use and why</h2>
            <ul className="flex flex-col gap-2">
              {notice.fields
                .filter((field) => field.collected)
                .map((field) => (
                  <li key={field.field}>
                    <span className="font-medium">{field.field}</span> — {field.purpose} ({field.basis}). {field.note}
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">Last sign-in time</h2>
            <p>{notice.legitimateInterest.purposeTest}</p>
            <p>{notice.legitimateInterest.necessityTest}</p>
            <p>{notice.legitimateInterest.balancingTest}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">Who else is involved</h2>
            <ul className="flex flex-col gap-2">
              {notice.recipients.map((recipient) => (
                <li key={recipient.name}>
                  {recipient.name} ({recipient.role}, {recipient.region}): {recipient.when}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">How long we keep it</h2>
            <ul className="flex flex-col gap-2">
              {Object.entries(notice.retention).map(([key, value]) => (
                <li key={key}>
                  <span className="font-medium">{key}</span>: {value}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">Your rights</h2>
            <p>
              You can {notice.rights.join(', ')}. This game does not make automated decisions about you. Direct
              marketing is not used. You can complain to {notice.complaints.join(' or ')}.
            </p>
            <Link className="text-green-500" to="/settings/privacy">
              Exercise these rights
            </Link>
          </section>
        </div>
      )}
    </main>
  );
};
