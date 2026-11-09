import express from 'express';
import v1Router from './router/v1';
import cors from 'cors';
import { initPassport } from './passport';
import authRoute from './router/auth';
import privacyRoute from './router/privacy';
import session from 'express-session';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import { cookieFlags, required } from './privacy/env';
import { runRetention } from './privacy/service';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: required('COOKIE_SECRET'),
    resave: false,
    saveUninitialized: false,
    cookie: cookieFlags(),
  })
);

initPassport();
app.use(passport.initialize());
app.use(passport.authenticate('session'));

const allowedHosts = process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : [];

app.use(
  cors({
    origin: allowedHosts,
    methods: 'GET,POST,PUT,PATCH,DELETE',
    credentials: true,
  })
);

app.use('/auth', authRoute);
app.use('/v1', v1Router);
app.use('/v1/privacy', privacyRoute);

required('JWT_SECRET');
required('PRIVACY_CONTROLLER_NAME');
required('PRIVACY_CONTACT_EMAIL');

const retentionMs = Number(process.env.PRIVACY_RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
if (retentionMs > 0) {
  const tick = () => {
    runRetention().catch((error) => {
      console.error('Retention pass failed', error);
    });
  };
  tick();
  setInterval(tick, retentionMs);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
