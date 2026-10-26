import { expect, it, vi } from 'vitest';
import { insertSentCopy, buildSentMime } from './gmail-sent-copy';
const mail = {fromEmail:'sender@example.com',fromName:'Sender',to:'buyer@example.com',subject:'Hello',html:'<p>Hello</p>',text:'Hello',messageId:'picc-abc@example.com',date:'2026-09-29T12:00:00Z'};
it('inserts a SENT copy without calling a Gmail send endpoint',async()=>{
 const request=vi.fn().mockResolvedValue(Response.json({id:'gmail-1'}));
 expect(await insertSentCopy('token',buildSentMime(mail),request)).toBe('gmail-1');
 expect(request.mock.calls[0][0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages?internalDateSource=dateHeader');
 expect(JSON.parse(request.mock.calls[0][1].body).labelIds).toEqual(['SENT']);
});
it('rejects header injection before any mailbox write',()=>{
 expect(()=>buildSentMime({...mail,to:'buyer@example.com\r\nBcc: other@example.com'})).toThrow();
});
it('treats a timeout as uncertain and never retries insertion internally',async()=>{
 const request=vi.fn().mockRejectedValue(new Error('timeout'));
 await expect(insertSentCopy('token',buildSentMime(mail),request)).rejects.toMatchObject({uncertain:true});
 expect(request).toHaveBeenCalledTimes(1);
});
it('folds Unicode subjects and uses a MIME boundary shorter than 70 characters',()=>{
 const mime=Buffer.from(buildSentMime({...mail,subject:'Résumé 📩 '.repeat(50),messageId:`picc-${'a'.repeat(64)}@example.com`}), 'base64url').toString();
 expect(mime.split('\r\n').every(line=>line.length<998)).toBe(true);
 expect(mime.match(/boundary="([^"]+)"/)![1].length).toBeLessThanOrEqual(70);
 expect(mime).toContain('Content-Transfer-Encoding: base64');
});
