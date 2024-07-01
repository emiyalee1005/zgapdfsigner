'use strict';

/**
 * @param {Object<string, *>} z
 */
function supplyZgaSigner(z){

//Only for nodejs Start//
if(z.forge){
	var forge = z.forge;
}
if(z.PDFLib){
	var PDFLib = z.PDFLib;
}
//Only for nodejs End//

/** @type {Object<string, TsaServiceInfo>} */
z.TSAURLS = {
	"1": {url: "http://ts.ssl.com", len: 12100},
	"2": {url: "http://timestamp.digicert.com", len: 11900},
	"3": {url: "http://timestamp.sectigo.com", len: 9900},
	"4": {url: "http://timestamp.entrust.net/TSS/RFC3161sha2TS", len: 10850},
	"5": {url: "http://timestamp.apple.com/ts01", len: 8600},
	"6": {url: "http://www.langedge.jp/tsa", len: 5700},
	"7": {url: "https://freetsa.org/tsr", len: 11000},
};

z.NewRef = class{
	/**
	 * @param {PDFLib.PDFRef} ref
	 * @param {number=} num
	 * @param {string=} nm
	 */
	constructor(ref, num, nm){
		/** @private @type {number} */
		this.oriNumber = ref.objectNumber;
		/** @private @type {number} */
		this.oriGeneration = ref.generationNumber;
		/** @private @type {string} */
		this.name = nm ? nm : "";
		/** @private @type {number} */
		this.newNumber = num ? num : 0;
	}

	/**
	 * @public
	 * @param {number} num
	 */
	setNewNumber(num){
		this.newNumber = num;
	}

	/**
	 * @public
	 * @param {boolean=} restore
	 */
	changeNumber(restore){
		if(!this.newNumber){
			if(restore){
				return;
			}else{
				throw new Error("Can NOT change number since new number is not set.");
			}
		}
		/** @type {PDFLib.PDFRef} */
		var ref = PDFLib.PDFRef.of(this.oriNumber, this.oriGeneration);
		ref.objectNumber = restore ? this.oriNumber : this.newNumber;
		ref.tag = ref.objectNumber + " " + this.oriGeneration + " R";
	}

	/**
	 * @public
	 * @return {string}
	 */
	toString(){
		return this.name + " -> old:" + this.oriNumber + ", new:" + this.newNumber;
	}
};

z.NewRefMap = class extends Map{

	constructor(){
		super();
		/** @private @type {number} */
		this.idx = 0;
		/** @private @type {PDFLib.PDFContext} */
		this.pdfcont = null;
		/** @private @type {number} */
		this.oriLastOnum = 0;
	}

	/**
	 * @public
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @param {boolean=} enc
	 * @return {PDFLib.PDFRef} If enc is true, the return value is the unique reference reserved for encrypting information.
	 */
	reorderPdfRefs(pdfdoc, enc){
		/** @type {z.NewRefMap} */
		const _this = this;
		_this.pdfcont = pdfdoc.context;
		/** @type {PDFLib.PDFRef} */
		var encref = enc ? _this.pdfcont.nextRef() : null;

		pdfdoc.getPages().forEach(function(/** @type {PDFLib.PDFPage} */a_pg){
			_this.addAndFindRelates(a_pg.ref, "Page");
		});
		_this.addAndFindRelates(_this.pdfcont.trailerInfo.Root, "Catalog");
		if(encref){
			_this.addAndFindRelates(encref, "Encrypt");
		}
		_this.pdfcont.enumerateIndirectObjects().forEach(function(/** @type {PdfObjEntry} */a_oety){
			/** @type {string} */
			var a_tag = a_oety[0].tag;
			/** @type {z.NewRef} */
			var a_new = _this.get(a_tag);
			if(!a_new){
				a_new = new z.NewRef(a_oety[0], ++_this.idx);
				_this.set(a_tag, a_new);
			}
		});
		_this.changeAll();
		_this.oriLastOnum = _this.pdfcont.largestObjectNumber;
		_this.pdfcont.largestObjectNumber = _this.idx;
		return encref;
	}

	/**
	 * @public
	 */
	restoreAll(){
		this.changeAll(true);
		this.pdfcont.largestObjectNumber = this.oriLastOnum;
		this.clear();
		this.idx = 0;
		this.oriLastOnum = 0;
		this.pdfcont = null;
	}

	/**
	 * @private
	 * @param {PDFLib.PDFRef} a_ref
	 * @param {string=} a_nm
	 */
	addAndFindRelates(a_ref, a_nm){
		if(!this.get(a_ref.tag)){
			this.set(a_ref.tag, new z.NewRef(a_ref, ++this.idx, a_nm));
			this.findRefs(this.pdfcont.lookup(a_ref), a_nm);
		}
	}

	/**
	 * @private
	 * @param {PDFLib.PDFObject|Array<PDFLib.PDFObject>|Map} a_val
	 * @param {string=} a_nm
	 */
	findRefs(a_val, a_nm){
		if(!a_val || a_nm == "/Parent"){
			return;
		}
		if(a_val instanceof PDFLib.PDFRef){
			this.addAndFindRelates(a_val, a_nm);
			return;
		}
		if(a_val.array){
			a_val = a_val.array;
		}
		if(Array.isArray(a_val)){
			a_val.forEach(function(/** @type {PDFLib.PDFObject} */b_val){
				this.findRefs(b_val, a_nm);
			}.bind(this));
			return;
		}
		if(a_val instanceof PDFLib.PDFPage){
			a_val = a_val.node;
		}
		while(a_val.dict && !(a_val instanceof Map)){
			a_val = a_val.dict;
		}
		if(a_val instanceof Map){
			/** @type {Iterator} */
			var a_es = a_val.entries();
			/** @type {IIterableResult<PdfObjEntry>} */
			var a_result = a_es.next();
			while(!a_result.done){
				this.findRefs(a_result.value[1], a_result.value[0].encodedName);
				a_result = a_es.next();
			}
			return;
		}
	}

	/**
	 * @private
	 * @param {boolean=} restore
	 */
	changeAll(restore){
		/** @type {Iterator} */
		var es = this.entries();
		/** @type {IIterableResult} */
		var result = es.next();
		while(!result.done){
			result.value[1].changeNumber(restore);
			result = es.next();
		}
	}

};

/** @type {z.NewRefMap<string, z.NewRef>} */
z.newRefs = new z.NewRefMap();

z.PdfSigner = class{
	/**
	 * @param {SignOption} signopt
	 */
	constructor(signopt){
		this.tsaU8ArrayResp = null
		/** @public @type {Zga.TsaFetcher} */
		this.tsaFetcher = null;
		/** @public @type {Zga.PdfCryptor} */
		this.cyptr = null;

		/** @private @const {string} */
		this.DEFAULT_BYTE_RANGE_PLACEHOLDER = "**********";
		/** @private @const {number} */
		this.NEWLINE = 10;
		/** @private @type {SignOption} */
		this.opt = signopt;
		/** @type {forge_key} */
		this.privateKey = null;
		/** @type {Zga.CertsChain} */
		this.cchain = null;
		/** @private @type {string} */
		this.signature = "";
		/** @private @type {number} */
		this.siglen = 0;
		/** @private @type {PDFLib.PDFHexString} */
		this.sigContents = null;
		/** @private @type {Uint8Array} */
		this.oriU8pdf = null;
		/** @private @type {Array<PdfObjEntry>} */
		this.apobjs = null;

		if(typeof this.opt.debug == "boolean"){
			z.debug = this.opt.debug;
		}else if(globalThis.debug){
			z.debug = true;
		}
		if(!(globalThis.PDFLib || PDFLib)){
			throw new Error("pdf-lib is not imported.");
		}
		if(!(globalThis.forge || forge)){
			throw new Error("node-forge is not imported.");
		}
		/** @type {?TsaServiceInfo} */
		var tsainf = null;
		if(signopt.signdate){
			if(typeof signopt.signdate == "string"){
				tsainf = {
					url: signopt.signdate,
				};
			}else if(signopt.signdate.url){
				tsainf = /** @type {TsaServiceInfo} */(Object.assign({}, signopt.signdate));
			}
		}
		if(tsainf){
			if(!z.urlFetch){
				throw new Error("Because of the CORS security restrictions, signing with TSA is not supported in web browser.");
			}
			if(z.TSAURLS[tsainf.url]){
				Object.assign(tsainf, z.TSAURLS[tsainf.url]);
			}else if(!(new RegExp("^https?://")).test(tsainf.url)){
				throw new Error("Unknown tsa data. " + JSON.stringify(tsainf));
			}
			if(!tsainf.len){
				tsainf.len = 16000;
			}
			this.tsaFetcher = new z.TsaFetcher(/** @type {TsaServiceInfo} */(tsainf));
		}
		if(signopt.ltv && !z.urlFetch){
			throw new Error("Because of the CORS security restrictions, signing with LTV is not supported in web browser.");
		}
		// if(signopt.permission == 1 && signopt.ltv){
			// z.log("To enable LTV we need to append informations after signing, this will destroy the signature if full DocMDP protection is set. (Sign with permission = 1)");
			// throw new Error("When set full DocMDP protection, LTV can't be enabled.");
		// }
	}

	/**
	 * @public
	 * @param {PDFLib.PDFDocument|Array<number>|Uint8Array|ArrayBuffer|string} pdf
	 * @param {EncryptOption=} cypopt
	 * @return {Promise<Uint8Array>}
	 */
	async sign(pdf, cypopt){
		if(cypopt && !z.PdfCryptor){
			throw new Error("ZgaPdfCryptor is not imported.");
		}

		/** @const {z.PdfSigner} */
		const _this = this;
		/** @type {PDFLib.PDFDocument} */
		var pdfdoc = null;
		if(pdf.addPage){
			pdfdoc = /** @type {PDFLib.PDFDocument} */(pdf);
		}else{
			if(Array.isArray(pdf)){
				_this.oriU8pdf = new Uint8Array(pdf);
			}else{
				_this.oriU8pdf = PDFLib.toUint8Array(/** @type {ArrayBuffer|Uint8Array|string} */(pdf));
			}
			pdfdoc = await PDFLib.PDFDocument.load(_this.oriU8pdf);
		}

		if(_this.opt.drawinf && _this.opt.drawinf.imgData && !_this.opt.drawinf.img){
			/** @type {Uint8Array|ArrayBuffer|string} */
			var imgData2 = null;
			if(Array.isArray(_this.opt.drawinf.imgData)){
				imgData2 = new Uint8Array(_this.opt.drawinf.imgData);
			}else{
				imgData2 = _this.opt.drawinf.imgData;
			}
			if(_this.opt.drawinf.imgType == "png"){
				_this.opt.drawinf.img = await pdfdoc.embedPng(imgData2);
			}else if(_this.opt.drawinf.imgType == "jpg"){
				_this.opt.drawinf.img = await pdfdoc.embedJpg(imgData2);
			}else{
				throw new Error("Unkown image type. " + _this.opt.drawinf.imgType);
			}
		}

		/** @type {forge_cert} */
		var cert = _this.loadP12cert(_this.opt.p12cert, _this.opt.pwd);
		/** @type {Zga.CertsChain} */
		var cchain = null;
		if(cert){
			if(z.urlFetch){
				cchain = new z.CertsChain();
				/** @type {?boolean} */
				var rootok = await cchain.buildChain(cert);
				if(rootok){
					_this.cchain = cchain;
				}
			}
			z.fixCertAttributes(cert);
		}else if(_this.tsaFetcher){
			z.log("No certificate is specified, so only add a document timestamp.")
		}else{
			throw new Error("Nothing to do because no certificate nor tsa is specified.");
		}

		/** @type {boolean} *///append mode or not
		var apmode = _this.addSignHolder(pdfdoc);
		z.log("A signature holder has been added to the pdf.");

		if(_this.opt.permission == 1 && (_this.opt.ltv == 1 || _this.opt.ltv == 2)){
			if(!_this.cchain){
				// Query a timestamp from tsa with dummy string to obtain the certificates.
				await _this.queryTsa("dummy");
			}
			/** @type {PDFLib.PDFDocument} */
			var dmydoc = await _this.addDss(pdfdoc);
			if(dmydoc){
				z.log("In order to enable LTV, DSS informations has been added to the pdf.");
			}
			// Clear ltv
			_this.opt.ltv = 0;
		}else{
			await pdfdoc.flush();
		}

		if(apmode){
			if(_this.oriU8pdf){
				z.log("The pdf has been signed already, so we add a new signature to it.");
			}else{
				throw new Error("When adding a new signature to a signed pdf, the original literal datas are necessary.");
			}

			// Find the changed objects
			await _this.findChangedObjects(pdfdoc);

		}else{
			// If the definitions of references are too chaotic, a signature contains DocMDP or after adding a new signature,
			// this signature may be invalid. So we make the order of references more neet.
			/** @type {PDFLib.PDFRef} */
			var encref = z.newRefs.reorderPdfRefs(pdfdoc, cypopt ? true : false);

			if(cypopt){
				if(cypopt.pubkeys){
					if(cypopt.pubkeys.length == 0){
						cypopt.pubkeys.push({
							c: cert,
						});
					}else{
						cypopt.pubkeys.forEach(function(/** @type {PubKeyInfo} */a_pubkey){
							// If there is no c in the PubKeyInfo, set cert to it.
							if(!a_pubkey.c){
								a_pubkey.c = cert;
							}
						});
					}
				}
				/** @type {Zga.PdfCryptor} */
				_this.cyptr = new z.PdfCryptor(cypopt);
				await _this.cyptr.encryptPdf(pdfdoc, encref);
				z.log("Pdf data has been encrypted.");
			}
		}

		/** @type {Uint8Array} */
		var ret = await _this.saveAndSign(pdfdoc);
		if(!ret){
			z.log("Change size of signature's placeholder and retry.");
			_this.sigContents.value = "0".repeat(_this.siglen + 10);
			ret = await _this.saveAndSign(pdfdoc);
		}

		// Because PDFRefs in PDFLib are stored staticly,
		// we need to restore all changed PDFRefs
		// for preparing the next execution.
		if(z.newRefs.size > 0){
			z.newRefs.restoreAll();
		}

		if(ret){
			z.log("Pdf has been signed.");
		}else{
			throw new Error("Failed to sign the pdf.");
		}

		pdfdoc = await _this.addDss(ret);
		if(pdfdoc){
			await _this.findChangedObjects(pdfdoc, true);
			ret = _this.appendIncrement(pdfdoc);
			z.log("LTV has been enabled.");
		}

		return ret;
	}

	/**
	 * @private
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @return {Promise<Uint8Array>}
	 */
	async saveAndSign(pdfdoc){
		/** @type {Uint8Array} */
		var uarr = null;
		if(this.apobjs && this.apobjs.length > 0){
			uarr = this.appendIncrement(pdfdoc);
		}else{
			uarr = await pdfdoc.save({"useObjectStreams": false});
		}
		/** @type {string} */
		var pdfstr = z.u8arrToRaw(uarr) + String.fromCharCode(this.NEWLINE);
		return await this.signPdf(pdfstr);
	}

	/**
	 * @private
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @param {boolean=} ignoreInfo
	 * @return {Promise}
	 */
	async findChangedObjects(pdfdoc, ignoreInfo){
		/** @const {z.PdfSigner} */
		const _this = this;
		// Find the changed objects
		/** @type {PDFLib.PDFDocument} */
		var oriPdfdoc = await PDFLib.PDFDocument.load(_this.oriU8pdf, {ignoreEncryption: true});
		_this.apobjs = [];
		pdfdoc.context.enumerateIndirectObjects().forEach(function(/** @type {PdfObjEntry} */a_ele){
			if(!(ignoreInfo && a_ele[0] == pdfdoc.context.trailerInfo.Info)){
				/** @type {PDFLib.PDFObject} */
				var a_obj = oriPdfdoc.context.lookup(a_ele[0]);
				if(!(a_obj && _this.isamePdfObject(a_ele[1], a_obj))){
					if(_this.cyptr){
						_this.cyptr.encryptObject(a_ele[0].objectNumber, a_ele[1]);
					}
					_this.apobjs.push(a_ele);
				}
			}
		});
	}

	/**
	 * @private
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @return {Uint8Array}
	 */
	appendIncrement(pdfdoc){
		/** @const {z.PdfSigner} */
		const _this = this;
		/** @type {PDFLib.PDFCrossRefSection} */
		var xref = PDFLib.PDFCrossRefSection.create();
		/** @type {number} */
		var stpos = _this.oriU8pdf.length;
		/** @type {Array<number>} */
		var buff = [];
		buff[0] = _this.NEWLINE;
		stpos++;
		_this.apobjs.forEach(function(/** @type {PdfObjEntry} */a_ele){
			/** @type {number} */
			var a_len = _this.objEntryToBytes(a_ele, buff);
			xref.addEntry(a_ele[0], stpos);
			stpos += a_len;
		});
		xref.copyBytesInto(buff, buff.length);

		/** @type {PDFLib.PDFDict} */
		var tdic = PDFLib.PDFWriter.forContext(pdfdoc.context, 0).createTrailerDict();
		tdic.set(PDFLib.PDFName.of("Prev"), PDFLib.PDFNumber.of(_this.findPrev(_this.oriU8pdf)));
		/** @type {PDFLib.PDFTrailerDict} */
		var ptdic = PDFLib.PDFTrailerDict.of(tdic);
		ptdic.copyBytesInto(buff, buff.length);
		buff.push(_this.NEWLINE);

		/** @type {PDFLib.PDFTrailer} */
		var ptlr = PDFLib.PDFTrailer.forLastCrossRefSectionOffset(stpos);
		ptlr.copyBytesInto(buff, buff.length);
		/** @type {Uint8Array} */
		var ret = new Uint8Array(_this.oriU8pdf.length + buff.length);
		ret.set(/** @type {!ArrayBufferView} */(_this.oriU8pdf));
		ret.set(/** @type {!ArrayBufferView} */(new Uint8Array(buff)), _this.oriU8pdf.length);
		return ret;
	}

	/**
	 * @private
	 * @param {Uint8Array} u8pdf
	 * @return {number}
	 */
	findPrev(u8pdf){
		/** @const {Uint8Array} */
		const eof = z.rawToU8arr("%%EOF");
		/** @const {number} */
		const c0 = "0".charCodeAt(0);
		/** @const {number} */
		const c9 = "9".charCodeAt(0);
		/** @type {number} */
		var step = 0;
		/** @type {string} */
		var num = "";
		for(var i = u8pdf.length - eof.length; i >= 0; i--){
			switch(step){
			case 0:
				/** @type {boolean} */
				var flg = true;
				for(var j=0; j<eof.length; j++){
					if(u8pdf[i+j] != eof[j]){
						flg = false;
						break;
					}
				}
				if(flg){
					step = 1;
				}
				break;
			case 1:
				if(u8pdf[i] >= c0 && u8pdf[i] <= c9){
					num = String.fromCharCode(u8pdf[i]);
					step = 2;
				}
				break;
			case 2:
				if(u8pdf[i] >= c0 && u8pdf[i] <= c9){
					num = String.fromCharCode(u8pdf[i]) + num;
				}else{
					step = 9;
				}
				break;
			}
			if(step >= 9){
				break;
			}
		}
		return parseInt(num, 10);
	}

	/**
	 * @private
	 * @param {PDFLib.PDFObject} obj1
	 * @param {PDFLib.PDFObject} obj2
	 * @return {boolean}
	 */
	isamePdfObject(obj1, obj2){
		/** @type {Array<number>} */
		var buff1 = [];
		obj1.copyBytesInto(buff1, 0);
		/** @type {Array<number>} */
		var buff2 = [];
		obj2.copyBytesInto(buff2, 0);
		if(buff1.length != buff2.length){
			return false;
		}
		for(var i=0; i<buff1.length; i++){
			if(buff1[i] != buff2[i]){
				return false;
			}
		}
		return true;
	}

	/**
	 * @private
	 * @param {PdfObjEntry} objety
	 * @param {Array<number>} buff
	 * @return {number}
	 */
	objEntryToBytes(objety, buff){
		/** @type {number} */
		var before = buff.length;
		objety[0].copyBytesInto(buff, buff.length);
		PDFLib.copyStringIntoBuffer("obj", buff, buff.length - 1);
		buff[buff.length] = this.NEWLINE;
		objety[1].copyBytesInto(buff, buff.length);
		buff[buff.length] = this.NEWLINE;
		PDFLib.copyStringIntoBuffer("endobj", buff, buff.length);
		buff[buff.length] = this.NEWLINE;
		return buff.length - before;
	}

	/**
	 * @private
	 * @param {Array<number>|Uint8Array|ArrayBuffer|string=} p12cert
	 * @param {string=} pwd
	 * @return {forge_cert}
	 */
	loadP12cert(p12cert, pwd){
		/** @const {z.PdfSigner} */
		const _this = this;
		// load P12 certificate
		if(!p12cert){
			return null;
		}else if(typeof p12cert !== "string"){
			p12cert = z.u8arrToRaw(new Uint8Array(p12cert));
		}
		// Convert Buffer P12 to a forge implementation.
		/** @type {forge.asn1} */
		var p12Asn1 = forge.asn1.fromDer(p12cert);
		/** @type {forge.pkcs12} */
		var p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, true, pwd);
		// Extract safe bags by type.
		// We will need all the certificates and the private key.
		/** @type {Object<string|number, P12Bag>} */
		var certBags = p12.getBags({
			"bagType": forge.pki.oids.certBag,
		})[forge.pki.oids.certBag];
		/** @type {Object<string|number, P12Bag>} */
		var keyBags = p12.getBags({
			"bagType": forge.pki.oids.pkcs8ShroudedKeyBag,
		})[forge.pki.oids.pkcs8ShroudedKeyBag];
		_this.privateKey = keyBags[0].key;

		/** @type {Array<forge_cert>} */
		var certs = [];
		/** @type {number} */
		var certIdx = -1;
		if(certBags){
			// Get all the certificates (-cacerts & -clcerts)
			// Keep track of the last found client certificate.
			// This will be the public key that will be bundled in the signature.
			Object.keys(certBags).forEach(function(a_ele){
				/** @type {forge_cert} */
				var a_cert = certBags[a_ele].cert;

				certs.push(a_cert);

				// Try to find the certificate that matches the private key.
				if(_this.privateKey.n.compareTo(a_cert.publicKey.n) === 0
				&& _this.privateKey.e.compareTo(a_cert.publicKey.e) === 0){
					certIdx = certs.length;
				}
			});
		}
		if(certIdx > 0){
			certIdx--;
			_this.cchain = new z.CertsChain(certs);
			if(_this.cchain.getSignCert() != certs[certIdx]){
				throw new Error("Chain of certificates is invalid.");
			}
			return certs[certIdx];
		}else{
			throw new Error("Failed to find a certificate.");
		}
	}

	/**
	 * @private
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @return {boolean} append mode or not
	 */
	addSignHolder(pdfdoc){
		/** @const {z.PdfSigner} */
		const _this = this;
		/** @const {number} */
		const docMdp = (_this.cchain && _this.opt.permission >= 1 && _this.opt.permission <= 3) ? _this.opt.permission : 0;
		/** @const {PDFLib.PDFContext} */
		const pdfcont = pdfdoc.context;
		/** @const {z.SignatureCreator} */
		const signcrt = new z.SignatureCreator(_this.opt.drawinf);
		/** @const {PDFLib.PDFPage} */
		const page = pdfdoc.getPages()[signcrt.getPageIndex()];
		/** @type {PDFLib.PDFRef} */
		var strmRef = signcrt.createStream(pdfdoc, _this.opt.signame);

		if(docMdp && !strmRef){
			strmRef = signcrt.createEmptyField(pdfcont);
		}

		/** @type {Array<string>} */
		var oldSigs = [];
		/** @type {PDFLib.PDFAcroForm} */
		var afrm = pdfdoc.catalog.getOrCreateAcroForm();
		afrm.getAllFields().forEach(function(/** @type {PdfFieldInfo} */a_finf){
			if(a_finf[0] instanceof PDFLib.PDFAcroSignature){
				/** @type {PDFLib.PDFString|PDFLib.PDFHexString} */
				var a_t = a_finf[0].T();
				if(a_t instanceof PDFLib.PDFString){
					oldSigs.push(a_t.asString());
				}else if(a_t instanceof PDFLib.PDFHexString){
					oldSigs.push(a_t.decodeText());
				}
			}
		});
		if(oldSigs.length > 0 && docMdp){
			throw new Error("Since the pdf has been signed, can NOT sign with DocMDP. Because the signature field that contains DocMDP must be the first signed field in the document.");
		}

		/** @type {string} */
		var signm = _this.fixSigName(oldSigs, _this.opt.signame);

		/** @type {Date} */
		var signdate = new Date();
		if(_this.opt.signdate instanceof Date && !_this.tsaFetcher){
			signdate = _this.opt.signdate;
		}

		/** @type {PDFLib.PDFArray} */
		var bytrng = new PDFLib.PDFArray(pdfcont);
		bytrng.push(PDFLib.PDFNumber.of(0));
		bytrng.push(PDFLib.PDFName.of(_this.DEFAULT_BYTE_RANGE_PLACEHOLDER));
		bytrng.push(PDFLib.PDFName.of(_this.DEFAULT_BYTE_RANGE_PLACEHOLDER));
		bytrng.push(PDFLib.PDFName.of(_this.DEFAULT_BYTE_RANGE_PLACEHOLDER));

		_this.siglen = /** @type {number} */(_this.tsaFetcher ? _this.tsaFetcher.len : 3322);
		_this.sigContents = PDFLib.PDFHexString.of("0".repeat(_this.siglen));

		/** @type {Object<string, *>} */
		var signObj = {
			"Type": "Sig",
			"Filter": "Adobe.PPKLite",
			"SubFilter": "adbe.pkcs7.detached",
			"ByteRange": bytrng,
			"Contents": _this.sigContents,
			"Prop_Build": pdfcont.obj({
				"App": pdfcont.obj({
					"Name": "ZgaPdfSinger",
				}),
			}),
		};
		if(_this.cchain){
			signObj.M = PDFLib.PDFString.fromDate(signdate);
		}else{
			signObj.Type = "DocTimeStamp";
			signObj.SubFilter = "ETSI.RFC3161";
		}
		if(docMdp){
			/** @type {PDFLib.PDFArray} */
			var rfrc = new PDFLib.PDFArray(pdfcont);
			rfrc.push(pdfcont.obj({
				"Type": "SigRef",
				"TransformMethod": "DocMDP",
				"TransformParams": pdfcont.obj({
					"Type": "TransformParams",
					"P": docMdp,
					"V": "1.2",
				}),
			}));
			signObj["Reference"] = rfrc;
		}
		if(_this.opt.reason){
			signObj["Reason"] = _this.convToPDFString(_this.opt.reason);
		}
		if(_this.opt.signame){
			signObj["Name"] = _this.convToPDFString(_this.opt.signame);
		}
		if(_this.opt.location){
			signObj["Location"] = _this.convToPDFString(_this.opt.location);
		}
		if(_this.opt.contact){
			signObj["ContactInfo"] = _this.convToPDFString(_this.opt.contact);
		}
		/** @type {PDFLib.PDFRef} */
		var signatureDictRef = pdfcont.register(pdfcont.obj(signObj));

		/** @type {Object<string, *>} */
		var widgetObj = {
			"Type": "Annot",
			"Subtype": "Widget",
			"FT": "Sig",
			"Rect": signcrt.getSignRect(),
			"V": signatureDictRef,
			"T": _this.convToPDFString(signm),
			"F": 132,
			"P": page.ref,
		};
		if(strmRef){
			widgetObj["AP"] = pdfcont.obj({
				"N": strmRef,
			});
		}
		/** @type {PDFLib.PDFRef} */
		var widgetDictRef = pdfcont.register(pdfcont.obj(widgetObj));

		// Add our signature widget to the page
		/** @type {PDFLib.PDFArray} */
		var ans = page.node.Annots();
		if(!ans){
			ans = new PDFLib.PDFArray(pdfcont);
			// if(docMdp){
				page.node.set(PDFLib.PDFName.Annots, ans);
			// }else{
				// page.node.set(PDFLib.PDFName.Annots, pdfcont.register(ans));
			// }
		}
		ans.push(widgetDictRef);

		if(!afrm.dict.lookup(PDFLib.PDFName.of("SigFlags"))){
			afrm.dict.set(PDFLib.PDFName.of("SigFlags"), PDFLib.PDFNumber.of(3));
		}
		afrm.addField(widgetDictRef);

		if(docMdp){
			pdfdoc.catalog.set(
				PDFLib.PDFName.of("Perms"),
				pdfcont.obj({
					"DocMDP": signatureDictRef,
				}),
			);
		}

		return (oldSigs.length > 0);
	}

	/**
	 * @private
	 * @param {Array<string>} oldSigs
	 * @param {string=} signm
	 * @param {number=} idx
	 * @return {string}
	 */
	fixSigName(oldSigs, signm, idx){
		if(!signm){
			signm = "Signature";
			idx = 1;
		}
		/** @type {string} */
		var nm = signm;
		if(idx){
			nm += idx;
		}else{
			idx = 0;
		}
		if(oldSigs.indexOf(nm) >= 0){
			return this.fixSigName(oldSigs, signm, idx+1);
		}else{
			return nm;
		}
	}

	/**
	 * @private
	 * @param {string} str
	 * @return {PDFLib.PDFString|PDFLib.PDFHexString}
	 */
	convToPDFString(str){
		// Check if there is a multi-bytes char in the string.
		/** @type {boolean} */
		var flg = false;
		for(var i=0; i<str.length; i++){
			if(str.charCodeAt(i) > 0xFF){
				flg = true;
				break;
			}
		}
		if(flg){
			return PDFLib.PDFHexString.fromText(str);
		}else{
			return PDFLib.PDFString.of(str);
		}
	}

	/**
	 * @private
	 * @param {string} pdfstr
	 * @return {Promise<Uint8Array>}
	 */
	async signPdf(pdfstr){
		/** @const {z.PdfSigner} */
		const _this = this;
		// Finds ByteRange information within a given PDF Buffer if one exists
		/** @type {Array<string>} */
		var byteRangeStrings = pdfstr.match(/\/ByteRange\s*\[{1}\s*(?:(?:\d*|\/\*{10})\s+){3}(?:\d+|\/\*{10}){1}\s*]{1}/g);
		/** @type {string|undefined} */
		var byteRangePlaceholder = byteRangeStrings.find(function(/** @type {string} */a_str){
			return a_str.includes("/"+_this.DEFAULT_BYTE_RANGE_PLACEHOLDER);
		});
		if(!byteRangePlaceholder){
			throw new Error("no signature placeholder");
		}
		/** @type {number} */
		var byteRangePos = pdfstr.indexOf(byteRangePlaceholder);
		/** @type {number} */
		var byteRangeEnd = byteRangePos + byteRangePlaceholder.length;
		/** @type {number} */
		var contentsTagPos = pdfstr.indexOf('/Contents ', byteRangeEnd);
		/** @type {number} */
		var placeholderPos = pdfstr.indexOf('<', contentsTagPos);
		/** @type {number} */
		var placeholderEnd = pdfstr.indexOf('>', placeholderPos);
		/** @type {number} */
		var placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
		/** @type {number} */
		var placeholderLength = placeholderLengthWithBrackets - 2;
		/** @type {Array<number>} */
		var byteRange = [0, 0, 0, 0];
		byteRange[1] = placeholderPos;
		byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
		byteRange[3] = pdfstr.length - byteRange[2];
		/** @type {string} */
		var actualByteRange = "/ByteRange [" + byteRange.join(" ") +"]";
		actualByteRange += ' '.repeat(byteRangePlaceholder.length - actualByteRange.length);
		// Replace the /ByteRange placeholder with the actual ByteRange
		pdfstr = pdfstr.slice(0, byteRangePos) + actualByteRange + pdfstr.slice(byteRangeEnd);
		// Remove the placeholder signature
		pdfstr = pdfstr.slice(0, byteRange[1]) + pdfstr.slice(byteRange[2], byteRange[2] + byteRange[3]);

		/** @type {forge.asn1} */
		var asn1sig = null;
		if(_this.cchain){
			/** @type {Date} */
			var signdate = new Date();
			if(_this.opt.signdate instanceof Date && !_this.tsaFetcher){
				signdate = _this.opt.signdate;
			}

			// Here comes the actual PKCS#7 signing.
			/** @type {forge.pkcs7} */
			var p7 = null;
			p7 = forge.pkcs7.createSignedData();
			// Start off by setting the content.
			p7.content = forge.util.createBuffer(pdfstr);

			// Add all the certificates (-cacerts & -clcerts) to p7
			_this.cchain.getAllCerts().forEach(function(/** @type {forge_cert} */a_cert){
				p7.addCertificate(a_cert);
			});

			// Add a sha256 signer. That's what Adobe.PPKLite adbe.pkcs7.detached expects.
			p7.addSigner({
				key: _this.privateKey,
				certificate: _this.cchain.getSignCert(),
				digestAlgorithm: forge.pki.oids.sha256,
				authenticatedAttributes: [
					{
						"type": forge.pki.oids.contentType,
						"value": forge.pki.oids.data,
					}, {
						"type": forge.pki.oids.signingTime,
						"value": signdate,
					}, {
						"type": forge.pki.oids.messageDigest,

					},
				],
			});

			// Sign in detached mode.
			p7.sign({"detached": true});

			if(_this.tsaFetcher){
				/** @type {forge.asn1} */
				var tsatoken = await _this.queryTsa(p7.signers[0].signature, true);
				p7.signerInfos[0].value.push(tsatoken);
			}
			asn1sig = p7.toAsn1();
		}else{
			asn1sig = await _this.queryTsa(pdfstr);
		}

		// Check if the PDF has a good enough placeholder to fit the signature.
		/** @type {forge.util.ByteStringBuffer} */
		var sigbuf = forge.asn1.toDer(asn1sig);
		/** @type {string} */
		var sighex = sigbuf.toHex();
		_this.signature = sigbuf.getBytes();
		// placeholderLength represents the length of the HEXified symbols but we're
		// checking the actual lengths.
		z.log("Size of signature is " + sighex.length + "/" + placeholderLength);
		if(sighex.length > placeholderLength){
			// throw new Error("Signature is too big. Needs: " + sighex.length);
			_this.siglen = sighex.length;
			return null;
		}else{
			// Pad the signature with zeroes so the it is the same length as the placeholder
			sighex += "0".repeat(placeholderLength - sighex.length);
		}
		// Place it in the document.
		pdfstr = pdfstr.slice(0, byteRange[1]) + "<" + sighex + ">" + pdfstr.slice(byteRange[1]);

		return z.rawToU8arr(pdfstr);
	}

	/**
	 * @private
	 * @param {string=} data
	 * @param {boolean=} forP7
	 * @return {Promise<forge.asn1>}
	 */
	async queryTsa(data, forP7){
		/** @const {z.PdfSigner} */
		const _this = this;
		/** @type {?string} */
		var err = await _this.tsaFetcher.queryTsa(data);
		if(err){
			throw new Error(err);
		}else{
			/** @type {forge.asn1} */
			var asn1 = _this.tsaFetcher.getToken(forP7);
			_this.tsaU8ArrayResp = _this.tsaFetcher.respU8Array
			z.log("Timestamp from " + _this.tsaFetcher.url + " has been obtained.");
			return asn1;
		}
	}

	/**
	 * @private
	 * @param {PDFLib.PDFDocument|Uint8Array} pdf
	 * @return {Promise<PDFLib.PDFDocument>}
	 */
	async addDss(pdf){
		/** @const {z.PdfSigner} */
		const _this = this;
		if(_this.opt.ltv != 1 && _this.opt.ltv != 2){
			return null;
		}
		/** @type {Zga.CertsChain} */
		var cchain = _this.cchain ? _this.cchain : _this.tsaFetcher.getCertsChain();
		if(cchain.isSelfSignedCert()){
			z.log("No need to enable LTV because the certificate is a self signed one.");
			return null;
		}
		/** @type {boolean} */
		var crlOnly = (_this.opt.ltv == 2);
		/** @type {?DSSInfo} */
		var dssinf = await cchain.prepareDSSInf(crlOnly);
		if(!dssinf){
			return null;
		}

		/** @type {PDFLib.PDFDocument} */
		var pdfdoc = null;
		if(pdf.addPage){
			pdfdoc = /** @type {PDFLib.PDFDocument} */(pdf);
		}else{
			_this.oriU8pdf = /** @type {Uint8Array} */(pdf);
			pdfdoc = await PDFLib.PDFDocument.load(_this.oriU8pdf, {ignoreEncryption: true});
		}
		/** @type {PDFLib.PDFContext} */
		var pdfcont = pdfdoc.context;
		/** @type {Array<PDFLib.PDFRef>} */
		var certRefs = null;
		/** @type {Array<PDFLib.PDFRef>} */
		var ocspRefs = null;
		/** @type {Array<PDFLib.PDFRef>} */
		var crlRefs = null;

		if(dssinf && dssinf.ocsps && dssinf.ocsps.length > 0){
			ocspRefs = [];
			dssinf.ocsps.forEach(function(/** @type {string|Uint8Array} */a_ocsp){
				/** @type {PDFLib.PDFRawStream} */
				var a_strmOcsp = pdfcont.flateStream(a_ocsp);
				ocspRefs.push(pdfcont.register(a_strmOcsp));
			});
		}
		if(dssinf && dssinf.crls && dssinf.crls.length > 0){
			crlRefs = [];
			dssinf.crls.forEach(function(/** @type {string|Uint8Array} */a_crl){
				/** @type {PDFLib.PDFRawStream} */
				var a_strmCrl = pdfcont.flateStream(a_crl);
				crlRefs.push(pdfcont.register(a_strmCrl));
			});
		}

		if(!(ocspRefs || crlRefs)){
			// Nothing to do.
			return null;
		}

		if(dssinf && dssinf.certs && dssinf.certs.length > 0){
			certRefs = [];
			dssinf.certs.forEach(function(/** @type {forge_cert} */a_cert){
				/** @type {forge.asn1} */
				var a_asn1Cert = forge.pki.certificateToAsn1(a_cert);
				/** @type {PDFLib.PDFRawStream} */
				var a_strmCert = pdfcont.flateStream(forge.asn1.toDer(a_asn1Cert).getBytes());
				certRefs.push(pdfcont.register(a_strmCert));
			});
		}

		/** @type {string} */
		var sighex = "";
		if(_this.signature){
			/** @type {forge.md.digest} */
			var md = forge.md.sha1.create();
			md.update(_this.signature);
			sighex = md.digest().toHex().toUpperCase();
		}

		var dss = /** @type {PDFLib.PDFDict} */(pdfdoc.catalog.lookupMaybe(PDFLib.PDFName.of("DSS"), PDFLib.PDFDict));
		/** @type {PDFLib.PDFArray} */
		var certsarr = null;
		/** @type {PDFLib.PDFArray} */
		var ocpsarr = null;
		/** @type {PDFLib.PDFArray} */
		var crlsarr = null;
		/** @type {PDFLib.PDFDict} */
		var vri = null;
		/** @type {Object<string, *>} */
		var vriObj = null;
		if(sighex){
			vriObj = {
				TU: PDFLib.PDFString.fromDate(new Date()),
			};
		}
		/** @type {PDFLib.PDFArray} */
		var sigcertsarr = null;
		/** @type {PDFLib.PDFArray} */
		var sigocpsarr = null;
		/** @type {PDFLib.PDFArray} */
		var sigcrlsarr = null;
		if(dss){
			certsarr = /** @type {PDFLib.PDFArray} */(dss.lookupMaybe(PDFLib.PDFName.of("Certs"), PDFLib.PDFArray));
			crlsarr = /** @type {PDFLib.PDFArray} */(dss.lookupMaybe(PDFLib.PDFName.of("CRLs"), PDFLib.PDFArray));
			ocpsarr = /** @type {PDFLib.PDFArray} */(dss.lookupMaybe(PDFLib.PDFName.of("OCSPs"), PDFLib.PDFArray));
			vri = /** @type {PDFLib.PDFDict} */(dss.lookupMaybe(PDFLib.PDFName.of("VRI"), PDFLib.PDFDict));
		}else{
			dss = /** @type {PDFLib.PDFDict} */(pdfcont.obj({}));
			pdfdoc.catalog.set(PDFLib.PDFName.of("DSS"), pdfcont.register(dss));
		}
		if(certRefs){
			if(vriObj){
				sigcertsarr = new PDFLib.PDFArray(pdfcont);
				vriObj["Cert"] = sigcertsarr;
			}
			if(!certsarr){
				certsarr = new PDFLib.PDFArray(pdfcont);
				dss.set(PDFLib.PDFName.of("Certs"), pdfcont.register(certsarr));
			}
			certRefs.forEach(function(/** @type {PDFLib.PDFRef} */a_ref){
				if(sigcertsarr){
					sigcertsarr.push(a_ref);
				}
				certsarr.push(a_ref);
			});
		}
		if(ocspRefs){
			if(vriObj){
				sigocpsarr = new PDFLib.PDFArray(pdfcont);
				vriObj["OCSP"] = sigocpsarr;
			}
			if(!ocpsarr){
				ocpsarr = new PDFLib.PDFArray(pdfcont);
				dss.set(PDFLib.PDFName.of("OCSPs"), pdfcont.register(ocpsarr));
			}
			ocspRefs.forEach(function(/** @type {PDFLib.PDFRef} */a_ref){
				if(sigocpsarr){
					sigocpsarr.push(a_ref);
				}
				ocpsarr.push(a_ref);
			});
		}
		if(crlRefs){
			if(vriObj){
				sigcrlsarr = new PDFLib.PDFArray(pdfcont);
				vriObj["CRL"] = sigcrlsarr;
			}
			if(!crlsarr){
				crlsarr = new PDFLib.PDFArray(pdfcont);
				dss.set(PDFLib.PDFName.of("CRLs"), pdfcont.register(crlsarr));
			}
			crlRefs.forEach(function(/** @type {PDFLib.PDFRef} */a_ref){
				if(sigcrlsarr){
					sigcrlsarr.push(a_ref);
				}
				crlsarr.push(a_ref);
			});
		}
		if(sighex && vriObj){
			if(!vri){
				vri = /** @type {PDFLib.PDFDict} */(pdfcont.obj({}));
				dss.set(PDFLib.PDFName.of("VRI"), pdfcont.register(vri));
			}
			vri.set(PDFLib.PDFName.of(sighex), pdfcont.register(pdfcont.obj(vriObj)));
		}
		await pdfdoc.flush();

		return pdfdoc;
	}
};

z.SignatureCreator = class{
	/**
	 * @param {SignDrawInfo=} drawinf
	 */
	constructor(drawinf){
		/** @private @type {number} */
		this.pgidx = 0;
		/** @private @type {Array<number>} */
		this.rect = [0, 0, 0, 0];
		/** @private @type {?SignDrawInfo} */
		this.drawinf = null;

		if(drawinf){
			this.drawinf = drawinf;
			if(this.drawinf.pageidx){
				this.pgidx = this.drawinf.pageidx;
			}
		}
	}

	/**
	 * @public
	 * @return {number}
	 */
	getPageIndex(){
		return this.pgidx;
	}

	/**
	 * @public
	 * @return {Array<number>}
	 */
	getSignRect(){
		return this.rect;
	}

	/**
	 * @public
	 * @param {PDFLib.PDFContext} pdfcont
	 * @return {PDFLib.PDFRef}
	 */
	createEmptyField(pdfcont){
		return pdfcont.register(pdfcont.obj({
			"Type": "XObject",
			"Subtype": "Form",
			"FormType": 1,
			"BBox": [0, 0, 0, 0],
		}));
	}

	/**
	 * @public
	 * @param {PDFLib.PDFDocument} pdfdoc
	 * @param {string=} signame
	 * @return {PDFLib.PDFRef} The unique reference assigned to the signature stream
	 */
	createStream(pdfdoc, signame){
		if(!this.drawinf){
			return null;
		}else if(!(this.drawinf.img || (this.drawinf.font && this.drawinf.font))){
			return null;
		}

		/** @type {Array<PDFLib.PDFPage>} */
		var pages = pdfdoc.getPages();
		/** @type {PDFLib.PDFPage} */
		var page = null;
		if(this.pgidx < pages.length){
			page = pages[this.pgidx];
		}else{
			throw new Error("Page index is overflow to pdf pages.");
		}
		/** @type {PDFLib.Rotation} */
		var pgrot = page.getRotation();
		pgrot.angle = PDFLib.toDegrees(pgrot) % 360;
		pgrot.type = PDFLib.RotationTypes.Degrees;
		/** @type {PdfSize} */
		var pgsz = page.getSize();
		/** @type {SignAreaInfo} */
		var areainf = this.calcAreaInf(pgsz, pgrot.angle, this.drawinf.area);

		// resources object
		/** @type {Object<string, *>} */
		var rscObj = {};
		/** @type {Array<PDFLib.PDFOperator>} */
		var sigOprs = [];
		/** @type {string} */
		var imgName = signame ? signame.concat("Img") : "SigImg";
		/** @type {string} */
		var fontName = signame ? signame.concat("Font") : "SigFont";
		if(this.drawinf.img){
			// Get scaled image size
			/** @type {PdfSize} */
			var imgsz = this.drawinf.img.size();
			/** @type {number} */
			var tmp = areainf.w * imgsz.height / imgsz.width;
			if(tmp <= areainf.h){
				areainf.h = tmp;
			}else{
				areainf.w = areainf.h * imgsz.width / imgsz.height;
			}

			rscObj["XObject"] = {
				[imgName]: this.drawinf.img.ref,
			};
			sigOprs = sigOprs.concat(PDFLib.drawImage(imgName, this.calcDrawImgInf(pgrot, areainf)));
		}
		if(this.drawinf.font){
			rscObj["Font"] = {
				[fontName]: this.drawinf.font.ref,
			};
		}

		this.rect = this.calcRect(pgrot.angle, areainf);

		var frmDict = /** @type {PDFLib.PDFDict} */(pdfdoc.context.obj({
			"Type": "XObject",
			"Subtype": "Form",
			"FormType": 1,
			"BBox": [0, 0, areainf.w, areainf.h],
			"Resources": rscObj,
		}));
		/** @type {PDFLib.PDFContentStream} */
		var strm = PDFLib.PDFContentStream.of(frmDict, sigOprs, true);
		return pdfdoc.context.register(strm);
	}

	/**
	 * Calculate area informations for drawing signature after rotate
	 *
	 * @private
	 * @param {PdfSize} pgsz
	 * @param {number} angle
	 * @param {SignAreaInfo} visinf
	 * @return {SignAreaInfo}
	 */
	calcAreaInf(pgsz, angle, visinf){
		var ret = /** @type {SignAreaInfo} */(Object.assign({}, visinf));
		// Calculate position after rotate
		switch(angle){
		case 90:
			ret.w = visinf.h;
			ret.h = visinf.w;
			ret.x = visinf.y + visinf.h;
			ret.y = visinf.x;
			break;
		case 180:
		case -180:
			ret.x = pgsz.width - visinf.x;
			ret.y = visinf.y + visinf.h;
			break;
		case 270:
		case -90:
			ret.w = visinf.h;
			ret.h = visinf.w;
			ret.x = pgsz.width - visinf.y - visinf.h;
			ret.y = pgsz.height - visinf.x;
			break;
		default:
			ret.y = pgsz.height - visinf.y - visinf.h;
		}
		return ret;
	}

	/**
	 * @private
	 * @param {number} angle
	 * @param {SignAreaInfo} areainf // { x, y, w, h }
	 * @return {Array<number>}
	 */
	calcRect(angle, areainf){
		/** @type {Array<number>} */
		var rect = [0, 0, 0, 0];
		rect[0] = areainf.x;
		rect[1] = areainf.y;
		switch(angle){
		case 90:
			rect[2] = areainf.x - areainf.h;
			rect[3] = areainf.y + areainf.w;
			break;
		case 180:
		case -180:
			rect[2] = areainf.x - areainf.w;
			rect[3] = areainf.y - areainf.h;
			break;
		case 270:
		case -90:
			rect[2] = areainf.x + areainf.h;
			rect[3] = areainf.y - areainf.w;
			break;
		default:
			rect[2] = areainf.x + areainf.w;
			rect[3] = areainf.y + areainf.h;
		}
		return rect;
	}

	/**
	 * Calculate informations for drawing image after rotate
	 *
	 * @private
	 * @param {PDFLib.Rotation} rot
	 * @param {SignAreaInfo} areainf // { x, y, w, h }
	 * @return {PdfDrawimgOption}
	 */
	calcDrawImgInf(rot, areainf){
		/** @type {PdfDrawimgOption} */
		var ret = {
			"x": 0,
			"y": 0,
			"width": areainf.w,
			"height": areainf.h,
			"rotate": rot,
			"xSkew": PDFLib.degrees(0),
			"ySkew": PDFLib.degrees(0),
		};
		switch(rot.angle){
		case 90:
			ret["x"] = areainf.w;
			ret["width"] = areainf.h;
			ret["height"] = areainf.w;
			break;
		case 180:
		case -180:
			ret["x"] = areainf.w;
			ret["y"] = areainf.h;
			break;
		case 270:
		case -90:
			ret["y"] = areainf.h;
			ret["width"] = areainf.h;
			ret["height"] = areainf.w;
			break;
		}
		return ret;
	}
};

}

//Only for nodejs Start//
if(typeof exports === "object" && typeof module !== "undefined"){
	module.exports = supplyZgaSigner;
}
//Only for nodejs End//
