export type Step={resource:string;path:string;remove:boolean;full:boolean};
export type Plan={steps:Step[];index:number;next:string|null;started:string;remoteStart:string|null;count:number};
export function canClaim(status:string,updated:Date,now:Date){return status!=='RUNNING'||now.getTime()-updated.getTime()>120000;}
export function startPlan(since:string|null,now:Date):Plan {
 const resources=['companies','orders','invoices','products'];
 const lower=since?new Date(Date.parse(since)-300000).toISOString():null;
 const steps:Step[]=resources.map(resource=>({resource,path:`/public/v1/${resource}${lower&&resource!=='companies'?`?updated_datetime=${encodeURIComponent(lower)},`:''}`,remove:false,full:!lower||resource==='companies'}));
 if(lower)resources.forEach(resource=>steps.push({resource,path:`/public/v1/deleted-records?record_type=${({companies:'COMPANY',orders:'ORDER',invoices:'INVOICE',products:'PRODUCT'} as Record<string,string>)[resource]}&deleted_datetime=${encodeURIComponent(lower)},`,remove:true,full:false}));
 return {steps,index:0,next:null,started:now.toISOString(),remoteStart:null,count:0};
}
export function advancePlan(plan:Plan,next:string|null,date:string|null,count:number):Plan {
 const remoteStart=plan.remoteStart||(date&&!Number.isNaN(Date.parse(date))?new Date(date).toISOString():null);
 if(!remoteStart)throw new Error('Distru did not return a valid server date; sync checkpoint was not advanced.');
 return {...plan,remoteStart,index:next?plan.index:plan.index+1,next,count:plan.count+count};
}
