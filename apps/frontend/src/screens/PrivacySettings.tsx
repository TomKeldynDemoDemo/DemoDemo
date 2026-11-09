import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_APP_BACKEND_URL ?? 'http://localhost:3000';

interface PrivacyState {
  user: {
    name: string | null;
    username: string | null;
    email: string | null;
    publicProfile: boolean;
    processingRestricted: boolean;
  };
  consents: Array<{ purpose: string; granted: boolean; policyVersion: string }>;
}

async function privacyFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${BACKEND_URL}/v1/privacy${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
}

export const PrivacySettings = () => {
  const [record, setRecord] = useState<PrivacyState | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [policyVersion, setPolicyVersion] = useState('');

  const load = async () => {
    try {
      const body = await privacyFetch('/me');
      setRecord(body);
      setName(body.user.name ?? '');
      setUsername(body.user.username ?? '');
      setUnauthenticated(false);
    } catch {
      setUnauthenticated(true);
    }
  };

  useEffect(() => {
    fetch(`${BACKEND_URL}/v1/privacy/notice`)
      .then((response) => response.json())
      .then((body) => setPolicyVersion(body.version))
      .catch(() => setPolicyVersion(''));
    load();
  }, []);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      const body = await privacyFetch('/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, username }),
      });
      setRecord(body);
      setMessage('Saved. A later Google or GitHub sign-in will keep this name.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    }
  };

  const setPublic = async (granted: boolean) => {
    setMessage('');
    try {
      const body = await privacyFetch('/consent', {
        method: 'POST',
        body: JSON.stringify({ granted, policyVersion }),
      });
      setRecord(body);
      setMessage(granted ? 'Public profile is on. You can turn it off here just as easily.' : 'Public profile is off.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    }
  };

  const restrict = async (restricted: boolean) => {
    setMessage('');
    try {
      const body = await privacyFetch('/restrict', {
        method: 'POST',
        body: JSON.stringify({ restricted }),
      });
      setRecord(body);
      setMessage(
        restricted
          ? 'Processing is limited to storage. Games and the public profile are paused.'
          : 'Restriction lifted.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    }
  };

  const objectToSecurity = async () => {
    setMessage('');
    try {
      const body = await privacyFetch('/object', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'SECURITY_LOG' }),
      });
      setMessage(body.reason);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const download = async () => {
    setMessage('');
    try {
      const body = await privacyFetch('/export');
      const blob = new Blob([JSON.stringify(body, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'chess-export.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed');
    }
  };

  const erase = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      await privacyFetch('/erase', {
        method: 'POST',
        body: JSON.stringify({ confirm }),
      });
      setRecord(null);
      setUnauthenticated(true);
      setMessage('Account erased. Games you played remain for your opponents.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erase failed');
    }
  };

  if (unauthenticated) {
    return (
      <div className="flex flex-col gap-3">
        <p>Sign in to access, correct, or erase your data.</p>
        <Link className="text-green-500" to="/login">
          Sign in
        </Link>
        {message && <p>{message}</p>}
      </div>
    );
  }

  if (!record) return <p>Loading your data…</p>;

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <p>
        <Link className="text-green-500" to="/privacy">
          Privacy notice
        </Link>
      </p>
      <p>
        Email: {record.user.email ?? 'none'}. Public profile: {record.user.publicProfile ? 'on' : 'off'}. Processing:{' '}
        {record.user.processingRestricted ? 'storage only' : 'active'}.
      </p>
      <form className="flex flex-col gap-3" onSubmit={saveName}>
        <label>
          Display name
          <input
            className="border px-3 py-2 rounded-md w-full mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Username
          <input
            className="border px-3 py-2 rounded-md w-full mt-1"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <button className="bg-green-500 text-white px-4 py-2 rounded-md w-fit" type="submit">
          Save corrections
        </button>
      </form>
      <div className="flex flex-wrap gap-3">
        <button
          className="border px-4 py-2 rounded-md"
          type="button"
          onClick={() => setPublic(!record.user.publicProfile)}
        >
          {record.user.publicProfile ? 'Hide public profile' : 'Publish public profile'}
        </button>
        <button className="border px-4 py-2 rounded-md" type="button" onClick={download}>
          Download my data
        </button>
        <button
          className="border px-4 py-2 rounded-md"
          type="button"
          onClick={() => restrict(!record.user.processingRestricted)}
        >
          {record.user.processingRestricted ? 'Lift restriction' : 'Restrict to storage'}
        </button>
        <button className="border px-4 py-2 rounded-md" type="button" onClick={objectToSecurity}>
          Object to last-login logging
        </button>
      </div>
      <form className="flex flex-col gap-3" onSubmit={erase}>
        <label>
          Type DELETE to erase this account
          <input
            className="border px-3 py-2 rounded-md w-full mt-1"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <button className="border border-red-500 text-red-500 px-4 py-2 rounded-md w-fit" type="submit">
          Erase account
        </button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};
