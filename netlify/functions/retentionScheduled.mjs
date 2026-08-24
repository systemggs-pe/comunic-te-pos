import {getAdminDb} from './_firebaseAdmin.mjs';
import {purgeRetention} from './_retention.mjs';

export default async function retentionScheduled() {
  try {
    const result = await purgeRetention(getAdminDb());
    console.log(JSON.stringify({
      event: 'retention.completed',
      purgedDniFotos: result.purgedDniFotos,
      purgedImageChunks: result.purgedImageChunks,
      hasMore: result.hasMore,
    }));
    return new Response(null, {status: 204});
  } catch (error) {
    console.error(JSON.stringify({
      event: 'retention.failed',
      errorName: String(error?.name || 'Error').slice(0, 80),
      errorMessage: String(error?.message || 'Error interno').slice(0, 200),
    }));
    throw error;
  }
}

// 08:00 UTC = 03:00 in America/Lima. Netlify schedules always use UTC.
export const config = {schedule: '0 8 * * *'};
