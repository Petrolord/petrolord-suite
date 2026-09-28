~Version
VERS.   3.0 : CWLS LOG ASCII STANDARD - VERSION 3.0
WRAP.   NO  : One line per depth step
DLM .   COMMA : Delimiter
~Well
STRT.M  1500.00 : First index value
STOP.M  1504.50 : Last index value
STEP.M  0.5 : Step
NULL.   -999.25 : Null value
WELL.   L3-TOPS : Well name
~Log_Definition
DEPT.M  : Depth {F}
GR  .GAPI : Gamma ray {F}
LITH.   : Lithology code {S}
TIME.   : Acquisition time {DT}
~Log_Data | Log_Definition
1500.00,60.0000,"SH 0",2019-03-12T10:10:00
1500.50,65.6949,"SH 1",2019-03-12T10:11:00
1501.00,71.2737,"SH 2",2019-03-12T10:12:00
1501.50,76.6229,"SH 0",2019-03-12T10:13:00
1502.00,81.6334,"SH 1",2019-03-12T10:14:00
1502.50,86.2031,"SH 2",2019-03-12T10:15:00
1503.00,90.2390,"SH 0",2019-03-12T10:16:00
1503.50,93.6588,"SH 1",2019-03-12T10:17:00
1504.00,96.3929,"SH 2",2019-03-12T10:18:00
1504.50,98.3855,"SH 0",2019-03-12T10:19:00
~Tops_Parameter
TOPS.   Picks : Tops set
~Tops_Definition
TOPN.   : Top name {S}
TOPT.M  : Top depth {F}
~Tops_Data | Tops_Definition
"Upper Sand",1501.00
"Lower Shale",1503.25
