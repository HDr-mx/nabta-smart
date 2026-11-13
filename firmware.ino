// Nabta Smart v3 — developed by haidar & zainab
// UNO R3: sensors A0..A5. Relay channels D7,D2,D3,D4,D5,D6.
// Active LOW relay default. Each pump/valve needs its own driver and supply.
// Never drive a motor directly from GPIO. Calibrate each channel before watering.
#include <Arduino.h>
#include <string.h>
#include <stdio.h>
const byte MAX_CHANNELS=6,RELAY_ON=LOW,RELAY_OFF=HIGH;
const byte RELAYS[MAX_CHANNELS]={7,2,3,4,5,6};
struct Channel {int low,high,dry,wet;unsigned long limit,started;bool automatic,pump,locked;};
Channel ch[MAX_CHANNELS];
byte enabled=1,selected=0,count=0;
bool host=false,overflow=false;
unsigned long lastHost=0,lastReport=0;
char buffer[80];
void setPump(byte i,bool on){if(on&&!ch[i].pump)ch[i].started=millis();ch[i].pump=on;digitalWrite(RELAYS[i],on?RELAY_ON:RELAY_OFF);}
void stopAll(){for(byte i=0;i<MAX_CHANNELS;i++){setPump(i,false);ch[i].automatic=false;}}
void command(char* s){
 if(!strcmp(s,"H")){lastHost=millis();return;}
 if(!host){stopAll();host=true;}
 lastHost=millis();
 int n,l,h,t,d,w;
 if(!strcmp(s,"X")){stopAll();return;}
 if(sscanf(s,"N %d",&n)==1){if(n>=1&&n<=MAX_CHANNELS){for(byte i=n;i<MAX_CHANNELS;i++){setPump(i,false);ch[i].automatic=false;}enabled=n;if(selected>=enabled)selected=0;}return;}
 if(sscanf(s,"S %d",&n)==1){if(n>=0&&n<enabled)selected=n;return;}
 Channel &c=ch[selected];
 if(!strcmp(s,"A")){setPump(selected,false);c.automatic=true;c.locked=false;}
 else if(!strcmp(s,"M")){setPump(selected,false);c.automatic=false;c.locked=false;}
 else if(!strcmp(s,"P 1")&&!c.automatic){c.locked=false;setPump(selected,true);}
 else if(!strcmp(s,"P 0")){setPump(selected,false);}
 else if(sscanf(s,"C %d %d %d %d %d",&l,&h,&t,&d,&w)==5&&l>=1&&h<=100&&l<h&&t>=5&&t<=120&&d>=0&&d<=1023&&w>=0&&w<=1023&&d!=w){c.low=l;c.high=h;c.limit=(unsigned long)t*1000;c.dry=d;c.wet=w;}
}
int moistureAt(byte i){int raw=analogRead(A0+i);return constrain(map(raw,ch[i].dry,ch[i].wet,0,100),0,100);}
void setup(){for(byte i=0;i<MAX_CHANNELS;i++){digitalWrite(RELAYS[i],RELAY_OFF);pinMode(RELAYS[i],OUTPUT);ch[i]={35,60,800,350,30000,0,false,false,false};}ch[0].automatic=true;Serial.begin(9600);}
void loop(){
 while(Serial.available()){char c=Serial.read();if(c=='\n'){if(!overflow){buffer[count]=0;command(buffer);}count=0;overflow=false;}else if(c!='\r'&&!overflow){if(count<sizeof(buffer)-1)buffer[count++]=c;else overflow=true;}}
 if(host&&millis()-lastHost>5000)stopAll();
 for(byte i=0;i<enabled;i++){Channel &c=ch[i];if(c.pump&&millis()-c.started>=c.limit){setPump(i,false);c.locked=true;}int moisture=moistureAt(i);if(c.automatic&&!c.locked&&millis()>3000){if(moisture<c.low)setPump(i,true);if(moisture>=c.high)setPump(i,false);}}
 if(millis()-lastReport>=1000){lastReport=millis();Serial.print("{\"version\":3,\"sensors\":[");for(byte i=0;i<enabled;i++){if(i)Serial.print(',');Serial.print("{\"moisture\":");Serial.print(moistureAt(i));Serial.print(",\"pump\":");Serial.print(ch[i].pump?"true":"false");Serial.print(",\"mode\":\"");Serial.print(ch[i].automatic?"auto":"manual");Serial.print("\",\"locked\":");Serial.print(ch[i].locked?"true":"false");Serial.print('}');}Serial.println("]}");}
}
