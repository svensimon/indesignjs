﻿main();

function main() {
	// Die Dateien auswählen... Mit getFileFilter() bekommt man einen Filefilter um in Mac bzw. Windows die auszuwählenden Dateien im Dialog einzuschränken
	var _filter = getFileFilter(".indt", "InDesign Template:");
	var _templateFile = File.openDialog("Bitte Template auswählen!", _filter, false);
	var _filter = getFileFilter(".doc", "Word Datei:");
	var _wordFile = File.openDialog("Bite Word Datei auswählen!", _filter, false);
	if (_templateFile == null || _wordFile == null) {
		alert ("Bitte wählen Sie ein Dokument und ein Template aus!");
		return;
	}
	// Existiert der Bilderordner?
	var _bildFolder = Folder (_wordFile.parent + "/Bilder");
	if (!_bildFolder.exists) {
		alert ("Das Verzeichnis für den automatischen Bildimport konnte nicht gefunden werden.");
		return;
	}

	var _userLevel = app.scriptPreferences.userInteractionLevel;
	app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
	var _dok = app.open(_templateFile);
	if (checkDok(_dok) == false) {
		alert ("Das ausgewählte Template entspricht nicht den Vorgaben!");
		app.scriptPreferences.userInteractionLevel = _userLevel;
		return;
	}
	var _hMUnits = _dok.viewPreferences.horizontalMeasurementUnits;
	_dok.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.MILLIMETERS;
	var _VMUnits = _dok.viewPreferences.verticalMeasurementUnits;
	_dok.viewPreferences.verticalMeasurementUnits = MeasurementUnits.MILLIMETERS;
	var _rulerOrigin = _dok.viewPreferences.rulerOrigin;
	_dok.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
	var _zeroPoint = _dok.zeroPoint;
	_dok.zeroPoint = [0,0];
	try {
		var _story = wordImport (_wordFile, _dok);
		styleDoc(_story, _dok, _bildFolder);
		createRegister (_dok);
		if (_dok.paragraphStyles.itemByName("Bild").isValid) {
			_dok.paragraphStyles.itemByName("Bild").remove();
		}
		if (_dok.paragraphStyles.itemByName("Kapitelstart").isValid) {
			_dok.paragraphStyles.itemByName("Kapitelstart").remove();
		}
	} catch (e) {
		alert ("Es ist ein Fehler aufgetreten: " + e + "\nZeile "+ e.line);
	}
	_dok.viewPreferences.horizontalMeasurementUnits = _hMUnits;
	_dok.viewPreferences.verticalMeasurementUnits = _VMUnits;
	_dok.viewPreferences.rulerOrigin = _rulerOrigin;
	_dok.zeroPoint = _zeroPoint;
	app.scriptPreferences.userInteractionLevel = _userLevel;
}


// Voraussetzungen prüfen ... 
function checkDok (_dok) {
	// Schriften prüfen 
	for (var f =0; f < _dok.fonts.length; f++ ) {
		if (_dok.fonts[f].status != FontStatus.INSTALLED) {
			alert("Bitte alle Schriften für das Template installieren!");
			return false;	
		}
	}
	// Prüfen ob alle Formate vorhanden sind
	if (_dok.objectStyles.itemByName ("icon").isValid &&
		_dok.objectStyles.itemByName ("bild").isValid &&
		_dok.paragraphStyles.itemByName ("abs").isValid &&
		_dok.paragraphStyles.itemByName ("u1").isValid &&
		_dok.paragraphStyles.itemByName ("u2").isValid &&
		_dok.paragraphStyles.itemByName ("einschub").isValid &&
		_dok.characterStyles.itemByName ("kursiv").isValid &&
		_dok.masterSpreads.itemByName ("V-Vorlage").isValid &&
		_dok.masterSpreads.itemByName ("R-Register").isValid ) 
	{
		return true;
	} else {
		return false;
	}
}
	
// Word-Datei importieren, Formate löschen und Inhaltsseiten aufbauen
function wordImport (_wordFile, _dok) {	
	with (app.wordRTFImportPreferences) {
		importEndnotes = true;
		importFootnotes = true;
		importIndex = false;
		importTOC = false;	
		useTypographersQuotes = true;
		convertPageBreaks = ConvertPageBreaks.NONE;
		preserveGraphics = true;
		preserveTrackChanges = false;
		convertBulletsAndNumbersToText = false;
		removeFormatting = false;
		importUnusedStyles = false;
		resolveParagraphStyleClash = ResolveStyleClash.RESOLVE_CLASH_USE_EXISTING;
		resolveCharacterStyleClash = ResolveStyleClash.RESOLVE_CLASH_USE_EXISTING;
	}	
	var _storyArray = _dok.pages[0].place(_wordFile, [24,28], undefined, false, true);
	var _story = _storyArray[0];
	if (_dok.paragraphStyles.itemByName("Standard").isValid) {
		_dok.paragraphStyles.itemByName("Standard").remove(_dok.paragraphStyles.itemByName("abs"));
	}
	if (_dok.paragraphStyles.itemByName("Überschrift 1").isValid) _dok.paragraphStyles.itemByName("Überschrift 1").remove(_dok.paragraphStyles.itemByName("u1"));
	if (_dok.paragraphStyles.itemByName("Überschrift 2").isValid) _dok.paragraphStyles.itemByName("Überschrift 2").remove(_dok.paragraphStyles.itemByName("u2"));
	if ( _dok.paragraphStyles.itemByName("Hinweistext").isValid) _dok.paragraphStyles.itemByName("Hinweistext").remove(_dok.paragraphStyles.itemByName("einschub"));
	if (_dok.characterStyles.itemByName("Fett").isValid) _dok.characterStyles.itemByName("Fett").remove(_dok.characterStyles.itemByName("kursiv")); 
	checkOverflow(_story);
	return _story;
}

// Text formatieren und Bilder platzieren 
function styleDoc (_story, _dok, _bildFolder) {		
	var _farbe= _dok.swatches.itemByName("Black");
	var _master = _dok.masterSpreads[0];
	var _newMaster = _master;
	for (var i = 0; i < _story.textContainers.length; i++) {
		var _tc = _story.textContainers[i];
		var _page = _tc.parentPage;
		for (k= 0; k < _tc.paragraphs.length; k++) {
			var _par = _tc.paragraphs[k].getElements()[0];
			_par.clearOverrides ();
			var _pSName = _par.appliedParagraphStyle.name;
			// Kapitel und Musterseiten aufbauen
			if (_pSName == "Kapitelstart" ) {
				var _kapitelName = _par.words[0].contents;
				_farbe = _dok.swatches.itemByName(_kapitelName);
				if (!_farbe.isValid) _farbe = _dok.swatches.itemByName("Black");
				var _iconName = _kapitelName.toLowerCase() + "_icon.jpg";
				var _iconFile = File(_bildFolder + "/" + _iconName);
				if (_iconFile.exists) {
					var _newMaster = _dok.masterSpreads.add();
					_newMaster.appliedMaster = _dok.masterSpreads.itemByName ("V-Vorlage");
					_newMaster.baseName = _kapitelName;
					_newMaster.namePrefix = _kapitelName[0];
					var _kolIcon = getMasterPageItem ("kolumne-icon", _newMaster.pages[1]);
					if (_kolIcon != null) {
						_kolIcon.fillColor = _farbe
						_kolIcon.place(_iconFile);
					}
					var _kolTitel = getMasterPageItem ("koltitel", _newMaster.pages[0]);
					if (_kolTitel != null) _kolTitel.paragraphs[0].fillColor = _farbe;
					_kolTitel = getMasterPageItem ("koltitel", _newMaster.pages[1]);
					if (_kolTitel != null) _kolTitel.paragraphs[0].fillColor = _farbe;
				}
				_par.remove();
				k--;
				continue;
			}
			// Überschriften formatieren 
			if ( _pSName == "u1" || _pSName == "u2") {
				_par.fillColor = _farbe;
				_nextPar = nextParagraph(_par)
				_nextPar.appliedParagraphStyle = _dok.paragraphStyles.itemByName("abs_ohne_einzug");
				_master = _newMaster;
				continue;
			}
			// Bilder platzieren 
			if ( _pSName == "Bild" ) {
				var _bildFile = File(_bildFolder + "/" + _par.words[0].contents);
				if (_bildFile.exists) {
					var _rect = _page.rectangles.add();
					_rect.geometricBounds = _tc.geometricBounds;
					_rect.place(_bildFile);
					_rect.appliedObjectStyle = _dok.objectStyles.itemByName ("bild");
					_rect.fit(FitOptions.FRAME_TO_CONTENT);
					_par.remove();
					k--;					
				}
				continue;
			}	
			// Hinweistext mit Icon versehen
			if (_pSName == "einschub" ) {
				_par.fillColor = _farbe;
				if (_iconFile.exists) {
					var _capHeigt = getCapHeight (_par.characters[0]);
					var _y1 = _par.characters[0].baseline - _capHeigt;
					var _x1 = _tc.geometricBounds[1];
					var _rect = _page.rectangles.add();
					_rect.geometricBounds = [_y1, _x1, _y1 + 8.2, _x1 + 8.2];
					_rect.place(_iconFile);
					_rect.appliedObjectStyle = _dok.objectStyles.itemByName ("icon");
					_rect.fit(FitOptions.CONTENT_TO_FRAME);
					_rect.fit(FitOptions.CENTER_CONTENT);
				}
			}		
		} // end for paragraphs 
		_page.appliedMaster = _master;
		checkOverflow(_story);
	} // end for textContainers
}

// Index erstellen 
function createRegister (_dok) {
	if (_dok.indexes.length == 0 ) {
		var _dokIndex = _dok.indexes.add();
	} else {
		var _dokIndex = _dok.indexes[0];
	}
	app.findGrepPreferences = NothingEnum.NOTHING;	
	if (app.findChangeGrepOptions.hasOwnProperty ("searchBackwards")) {
		app.findChangeGrepOptions.searchBackwards = false;
	}
	app.findGrepPreferences.appliedCharacterStyle = app.activeDocument.characterStyles.itemByName("kursiv");
	_ergebnisArray =_dok.findGrep(true);
	app.findGrepPreferences = NothingEnum.NOTHING;
	// Indexeinträge erstellen 
	for (var i = 0; i < _ergebnisArray.length; i++) {
		var _indexEintrag = _ergebnisArray[i];
		 var _topic = _dokIndex.topics.add(_indexEintrag.contents);	 
		 _topic.pageReferences.add(_indexEintrag);
	}
	var _regPage = _dok.pages.add();
	_regPage.appliedMaster = _dok.masterSpreads.itemByName ("R-Register");
	_dok.indexes[0].generate (_regPage, [24,28], undefined, true );		
}
// Allgemeine Funktionen 
// Prüft ob der letzte Textrahmen der Story _story einen Texüberlauf hat oder leer ist. Ggf. werden Textrahmen hinzugefügt oder gelöscht
function checkOverflow(_story) {
	var _lastTC = _story.textContainers[_story.textContainers.length - 1];
	var _run = true;
	while (_lastTC.overflows && _run) {
		var _last = _story.textContainers.length -1;
		if (_story.textContainers[_last].characters.length == 0 && _story.textContainers[_last -1].characters.length == 0 && _story.textContainers[_last -2].characters.length ==0 ) _run = false;
		var _page = _lastTC.parentPage;
		var _tf = addPageTextFrame(_page);
		_lastTC.nextTextFrame = _tf;
		_lastTC = _tf;
	}
	while (_lastTC.characters.length == 0) {
		var _page = _lastTC.parentPage;
		_page.remove();
		_lastTC = _story.textContainers[_story.textContainers.length - 1];
	}
}
// Fügt eine neue Seite mit einen Textrahmen in der Größe des Satzspiegels hinzu
function addPageTextFrame(_page, _master, _newPage) {
	if (_newPage == undefined)  _newPage = true;
	var _dok = _page.parent.parent;
	if (_newPage ) {
		var _newPage = _dok.pages.add(LocationOptions.AFTER, _page);
		if (_master == undefined) _newPage.appliedMaster = _page.appliedMaster;
		else _newPage.appliedMaster = _master;
	}
	else {
		var _newPage = _page;
	}
	var _y1 = _newPage.marginPreferences.top;
	var _y2 = _dok.documentPreferences.pageHeight - _newPage.marginPreferences.bottom;
	if (_newPage.side == PageSideOptions.LEFT_HAND) {
		var _x1 = _newPage.marginPreferences.right;
		var _x2 = _dok.documentPreferences.pageWidth - _newPage.marginPreferences.left;
	} 
	else {
		var _x1 = _newPage.marginPreferences.left;
		var _x2 = _dok.documentPreferences.pageWidth - _newPage.marginPreferences.right;
	}
	var _tf = _newPage.textFrames.add();
	_tf.geometricBounds = [_y1 , _x1 , _y2 , _x2];
	_tf.textFramePreferences.textColumnCount = _newPage.marginPreferences.columnCount;
	_tf.textFramePreferences.textColumnGutter =  _newPage.marginPreferences.columnGutter
	return _tf;
}
// Liefert ein benanntes Seitenobjekt zurück. Unabhängig, ob es sich noch auf der Musterseite befindet oder bereits gelöst wurde // Achtung: Ab CS5 muss sichergestellt sein, dass der Name in der Eigenschaft name enthalten ist (vs. label CS3/CS4)
function getMasterPageItem(_label, _page) {
	if (_page.appliedMaster == null ) return null; // No MasterPage applied 
	var _pi = _page.pageItems.itemByName(_label);
	if (_pi == null ) {
		if (_page.side == PageSideOptions.RIGHT_HAND) {
			var _mPage = _page.appliedMaster.pages[1];
			var _mpi = _mPage.pageItems.itemByName(_label);
			while (_mpi == null && _mPage.appliedMaster != null) {
				_mpi = _mPage.appliedMaster.pages[1].pageItems.itemByName(_label);
				_mPage = _mPage.appliedMaster.pages[1];
			}
			try { // Try to release the object
				var pageItem = _mpi.override(_page);
				var piBounds = pageItem.geometricBounds;
				var mpiBounds = _mpi.geometricBounds;
				if (piBounds[0]  != mpiBounds[0] ||  piBounds[1]  != mpiBounds[1] ) {
					pageItem.geometricBounds = mpiBounds;
				} 						
				return pageItem;
			} catch (e) { // Object was already released but was deleted as it is also included in _pi!
				return null;
			}
		} else { // Left or Single
			var _mPage = _page.appliedMaster.pages[0];
			var _mpi = _mPage.pageItems.itemByName(_label);
			while (_mpi == null && _mPage.appliedMaster != null) {
				_mpi = _mPage.appliedMaster.pages[0].pageItems.itemByName(_label);
				_mPage = _mPage.appliedMaster.pages[0];
			}					
			try {
				var pageItem = _mpi.override(_page);
				var piBounds = pageItem.geometricBounds;
				var mpiBounds = _mpi.geometricBounds;
				if (piBounds[0]  != mpiBounds[0] ||  piBounds[1]  != mpiBounds[1] ) {
					pageItem.geometricBounds = mpiBounds;
				} 						
				return pageItem;
			} catch (e) {
				return null;
			}
		}
	}
	else { // Object has already been released ...
		return _pi;
	}
}
// Liefert die Versalhöhe von _char zurück
function getCapHeight (_char) {
	var _tf = app.activeDocument.textFrames.add();
	_tf.geometricBounds = [0,-100,100,-200];
	_tf.textFramePreferences.insetSpacing = [0,0,0,0];
	var _checkChar = _char.duplicate(LocationOptions.AT_BEGINNING, _tf);
	_checkChar.contents = "H";
	_checkChar.alignToBaseline = false;
	_tf.textFramePreferences.firstBaselineOffset = FirstBaseline.CAP_HEIGHT; 
	var _versalHoehe = _checkChar.baseline;
//~ 	$.writeln("Versahlhöhe ist: " + _versalHoehe);
	_tf.remove();
	return _versalHoehe;
}
// Optimiert die Funktion nextItem() der Sammlung Paragraphs, Dieser Ansatz liefert bei großen Textmengen deutlich schneller den nächsten Absatz als nextItem()
function nextParagraph(_par) {
	var _lastCharLetzterIndex = _par.characters[-1].index;
	var _firstCharNaechster = _par.parentStory.characters[_lastCharLetzterIndex + 1];
	if (_firstCharNaechster != null ) return _firstCharNaechster.paragraphs[0]
	else return null;
}
// Filter für Dateiauswahl 
function getFileFilter (_ext, _string) {
	if (File.fs == "Windows") {
		_ext =_ext.replace(/\*/g, "");
		_string =_string.replace(/:/g, "");
		var _filter = _string + ":*"+ _ext;
	} 
	else {
		function _filterFilesMac(file) {
			while (file.alias) {
				file = file.resolve();
				if (file == null) { return false }
			}
			if (file.constructor.name == "Folder") return true;
			var _extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
			if (_extension.indexOf (_ext) > -1 ) return true;
			else return false
		}
		var _filter = _filterFilesMac;
	} 
	return _filter;
}