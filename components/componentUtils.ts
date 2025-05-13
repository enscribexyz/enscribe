import {METRICS_URL} from "@/utils/constants";

export async function logMetric(
    corelationId: String,
    timestamp: number,
    chainId: number,
    contractAddress: String,
    senderAddress: String,
    name: String,
    step: String,
    txnHash: String,
    contractType: String,
    opType: String) {
    await fetch(METRICS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            co_id: corelationId,
            contract_address: contractAddress,
            ens_name: name,
            deployer_address: senderAddress,
            network: chainId,
            timestamp: Math.floor(timestamp / 1000),
            step: step,
            txn_hash: txnHash,
            contract_type: contractType,
            op_type: opType,
            source: "enscribe"
        }),
    });
}
