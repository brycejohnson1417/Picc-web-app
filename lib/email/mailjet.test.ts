import { expect, it, vi } from 'vitest';
import { sendMailjetMessage, verifyMailjetSender } from './mailjet';
const config = { apiKey: 'test-key', apiSecret: 'test-secret', fromEmail: 'sender@example.com', fromName: 'Example' };
const message = { to:'recipient@example.com', subject:'Test', html:'<p>Test</p>', text:'Test', idempotencyKey:'notice-123' };
it('uses Mailjet basic auth and checks per-message acceptance', async () => {
  const request=vi.fn().mockResolvedValue(Response.json({Messages:[{Status:'success',To:[{Email:message.to,MessageUUID:'message-1'}]}]}));
  expect(await sendMailjetMessage(config,message,request)).toEqual({status:'SENT',providerMessageId:'message-1',error:null});
  expect(request.mock.calls[0][0]).toBe('https://api.mailjet.com/v3.1/send');
  const init=request.mock.calls[0][1];
  expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('test-key:test-secret').toString('base64')}`);
  expect(JSON.parse(init.body).Messages[0]).toMatchObject({From:{Email:config.fromEmail},To:[{Email:message.to}],CustomID:'notice-123'});
});
it.each([{Messages:[{Status:'error',Errors:[{ErrorMessage:'secret must not leak'}]}]},{}])('does not mistake HTTP 200 for an accepted send', async (payload) => {
  const result=await sendMailjetMessage(config,message,vi.fn().mockResolvedValue(Response.json(payload)));
  expect(result.status).toBe('FAILED');expect(result.error).not.toContain('secret');
});
it('returns safe failure on network errors without retrying a potentially accepted message', async () => {
  const request=vi.fn().mockRejectedValue(new Error('test-secret'));
  expect((await sendMailjetMessage(config,message,request)).status).toBe('FAILED');expect(request).toHaveBeenCalledTimes(1);
});
it('rejects inactive sender validation', async () => {
  await expect(verifyMailjetSender(config,vi.fn().mockResolvedValue(Response.json({Data:[{Email:config.fromEmail,Status:'Inactive'}]})))).rejects.toThrow('verified sender');
});
