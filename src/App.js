import React, { useState,useContext, useEffect } from "react";
import { ethers } from "ethers"; 
import logo from './logo.svg';
import './App.css';
import abi from 'ethereumjs-abi';
import {
  ChakraProvider,
  Heading,
  Box,
  Button, 
  Textarea, 
  Input,
  Checkbox,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  useToast,
  Text 
} from "@chakra-ui/react";
import { vnchrTokenAbi, transferHandlerAbi, forwarderAbi } from "./abis";

function App() {

  const VNCHR_TOKEN_ADDRESS = "0xc2Ca6b686cf22F570E3a4a932AeD12F9F2fa382C";
  const VNCHR_TRANSFER_HANDLER = "0xF6FA7d545A4c6449c5d84b0768129085d386c1a3";
  const VNCHR_FORWARDER = "0x43823E370cBa2cda8cD2b37D111eAB24AbCB6d3C";

  const toast = useToast();
  
  const [receiver, setReceiver] = useState("");
  const [seed, setSeed] = useState("");
  const [emsg, setEmsg] = useState("");
  const [loading, setLoading] = useState(false);


  const onChangeReceiver = (event) => {
    setReceiver(event.target.value);
  };

  const onChangeSeed = (event) => {
    setSeed(event.target.value);
  };

  useEffect(()=>{
    if(emsg!=""){
      toast({
        title:"Something went wrong",
        description:emsg,
        status: "error",
        duration: 9000,
        isClosable: true,
      });
      setEmsg("");
      setLoading(false);
    }
  },[emsg])

  const payout = async() => {
    //handle permit call for seed wallet
    //handle transfer call via transferhandler contract
    try{
      const wallet = ethers.Wallet.fromMnemonic(seed);
      console.log(await wallet.getAddress())
      const maticProvider = new ethers.providers.JsonRpcProvider("https://matic-mainnet.chainstacklabs.com");
      const vnchrContract = new ethers.Contract(VNCHR_TOKEN_ADDRESS,vnchrTokenAbi,maticProvider);
      const balance = await vnchrContract.balanceOf(await wallet.getAddress());
      console.log(balance.toString());

      await vnchrContract.balanceOf(receiver);
      
      if (balance.toString() == "0") throw Error("Generated wallet doesn't hold tokens");
      
     
      const permitABI = [
        "function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external",
        "function nonces(address owner) external view returns (uint)",
        "function DOMAIN_SEPARATOR() external view returns (bytes32)"
      ]
      const types = {
        Permit: [{
          name: "owner",
          type: "address"
          },
          {
            name: "spender",
            type: "address"
          },
          {
            name: "value",
            type: "uint256"
          },
          {
            name: "nonce",
            type: "uint256"
          },
          {
            name: "deadline",
            type: "uint256"
          }
        ]
      }
  
      const domain = {
        name:"VNCHRTokenMetaTx",
        version:"1",
        chainId:"137",
        verifyingContract:VNCHR_TOKEN_ADDRESS
      }

      const req = {
        owner : await wallet.getAddress(),
        spender : VNCHR_TRANSFER_HANDLER,
        value : (ethers.constants.MaxUint256).toString(),
        nonce : "0",
        deadline : (Math.floor(Date.now()/1000))+240
      }
  
      console.log(req);
  
      const dataToSign = {
        types: types,
        domain: domain,
        primaryType: "Permit",
        message: req,
      };

      const signature = await wallet._signTypedData( domain , types , req );
  
      const r = signature.substring(0, 66);
      const s = "0x" + signature.substring(66, 130);
      const v = parseInt(signature.substring(130, 132), 16);

      console.log([
        req.owner,req.spender,req.value,req.deadline,v,r,s
      ]);

      const response = await fetch(
        "https://api.biconomy.io/api/v2/meta-tx/native",
        {
          method: 'POST',
          headers: {
            "x-api-key":"JnSLHvQ-I.66efd0c6-27a2-4424-9390-30d8ed4bc1b4",
            "Content-Type": "application/json"
          },
          body:JSON.stringify(
            {
              to : VNCHR_TOKEN_ADDRESS,
              apiId:"db671c30-bc13-48c0-950a-1ee80d772aed",
              params : [
                req.owner,req.spender,req.value,(req.deadline).toString(),v.toString(),r,s
              ],
              from : await wallet.getAddress()
            }
          )
        }
      );

      const responseJson = await response.json()
      await maticProvider.waitForTransaction(responseJson.txHash,1);
      console.log(responseJson.txHash);

      const transferHandler = new ethers.Contract(VNCHR_TRANSFER_HANDLER,transferHandlerAbi);
      const transferTx = await transferHandler.populateTransaction.transfer(VNCHR_TOKEN_ADDRESS,receiver,balance.toString());

      const req1 = {
        from: await wallet.getAddress(),
        to: VNCHR_TRANSFER_HANDLER,
        token: VNCHR_TOKEN_ADDRESS,
        txGas: "1000000",
        tokenGasPrice: "0",
        batchId: "0",
        batchNonce: "0",
        deadline: Math.floor(Date.now() / 1000) + 120,
        data: transferTx.data
      };

      const hashToSign = abi.soliditySHA3(['address','address','address','uint256','uint256','uint256','uint256','uint256','bytes32'],
                                                [req1.from,req1.to,req1.token,req1.txGas,req1.tokenGasPrice,req1.batchId,req1.batchNonce,req1.deadline,
                                                    ethers.utils.keccak256(req1.data)]);
    
      const signature1 = await wallet.signMessage(hashToSign);

      const response1 = await fetch(
        "https://api.biconomy.io/api/v2/meta-tx/native",
        {
          method: 'POST',
          headers: {
            "x-api-key":"JnSLHvQ-I.66efd0c6-27a2-4424-9390-30d8ed4bc1b4",
            "Content-Type": "application/json"
          },
          body:JSON.stringify(
            {
              apiId:"6ad6440e-8991-4873-ab02-de0ee3af2890",
              to : VNCHR_FORWARDER,
              from : await wallet.getAddress(),
              params : [req1, signature1]
            }
          )
        }
      );
      const responseJson1 = await response1.json();
      await maticProvider.waitForTransaction(responseJson1.txHash,1);
      console.log(responseJson1.txHash);

      window.location.replace("https://explorer-mainnet.maticvigil.com/tx/"+responseJson1.txHash)

    }
    catch(error){
      setEmsg("Error : "+error.message);
      console.log(error);
    }
  }

  return (
    
      <Box padding={20}>
      <Heading size="2xl" color="#1166ff">$VNCHR Envelope Redemption Form</Heading>
      <br/>
      <FormControl id="ethAddress">
        <FormLabel fontWeight="bold" color="#444444">Polygon/Matic Network Address</FormLabel>
        <Input placeholder="Enter your address here" type="text" value={receiver} onChange={onChangeReceiver}/>
        <FormHelperText>Copy your address from Metamask. Any BSC / Ethereum address that isn't a contract wallet will work</FormHelperText>
      </FormControl>
      <br/>
      <FormControl id="seed">
        <FormLabel fontWeight="bold" color="#444444">Redemption Code (Mnemonic)</FormLabel>
        <Textarea 
          placeholder="lorem ipsum dolor sit amet consectetur adipiscing elit suspendisse pulvinar ex ornare" 
          type="seed"
          value={seed} 
          onChange={onChangeSeed} 
        />
        <FormHelperText>Type each word in lowercase with one space between each word</FormHelperText>
      </FormControl>
      <br/>
      <FormControl id="confirmation">
        <Checkbox>I Understand this action is not reversable</Checkbox>
        <FormHelperText>If you've entered the wrong address by mistake, we will not be able to assist in the recovery of your $VNCHR</FormHelperText>
      </FormControl>
      <br/>
      <Button isLoading={loading} colorScheme="blue" onClick={()=>{setLoading(true);payout();}}>Get $VNCHR!!!</Button>
      <Text>Your transfer could take a minute or two. Don't close this window, it will redirect upon completion</Text>
      </Box>
  );
}

export default App;
