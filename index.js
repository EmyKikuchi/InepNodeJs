function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

//var myArgs = process.argv.slice(2);
// const UF = myArgs[0];
// const CITY = myArgs[1];
/*
// netlify
const chromium = require('chrome-aws-lambda')
const puppeteer = require('puppeteer-core');*/

const puppeteer = require('puppeteer');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const timeout = require('connect-timeout');
const { Console } = require('console');

// crio um servidor express
const app = express();
app.use(timeout('60s'))

// aplico configurações para dentro do servidor express, adicionando middlewares (body-parser, morgan, cors)
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express started at http://localhost:${PORT}`));

// criação de rota que será acessada utilizando o método HTTP GET/
// http://localhost:3000/
app.get('/', (req, res) => {
    res.send('Hello World',200);    
});    

app.get(`/inep`, async (req, res) => {
    
    await get_data(req,res, PORT)
        .then( info => {
            res.json({ info });//console.log(result);        
        }).catch(function(e) {
            // rejection
            console.log(e);
        });
});

async function get_data(req, res, PORT) {
    let UF = req.query.UF;//'MINAS GERAIS';
    let CITY = req.query.CITY;//'BELO HORIZONTE';   
    let PERIODO = req.query.PERIODO;//'BELO HORIZONTE';   

    const URL = 'https://inepdata.inep.gov.br/analytics/saw.dll?Dashboard&NQUser=inepdata&NQPassword=Inep2014&PortalPath=%2Fshared%2FPainel%20Educacional%2F_portal%2FPainel%20Municipal';
    const SELETOR_DROP_1 = 'img[src="/analyticsRes/res/s_InepdataPainelMunicipal/master/selectdropdown_ena.png"]';

    if( PORT === 3000){
        // LOCAL
        var browser = await puppeteer.launch();
    }else{
        // HEROKU
        var browser = await puppeteer.launch({
            args: [
                '--no-sandbox'                    
            ],
        });
        //'--disable-setuid-sandbox',
    }

    const page = await browser.newPage();
    await page.goto(URL);
    await page.waitForNavigation();
    console.log('Page URL:', page.url());

    /* PREENCHER DADOS */

    // #UF * 1- click dropdown, 2- click item    
    console.log('CLICK DROP 1');
    await page.$eval(SELETOR_DROP_1, el => el.click());
    
    console.log(`CLICK ITEM ${UF}`);
    await page.$eval(`div[title="${UF}"]`, el => el.click());

    await delay(500);

    // #CITY * 1- click dropdown, 2- click item
    console.log('CLICK DROP 2');
    await page.evaluate(() => { document.querySelectorAll('.promptDropDownButton')[1].click(); }
    );

    await delay(700);
    console.log(`CLICK ${CITY}`);
    await page.$eval(`div.promptMenuOption[title="${CITY}"]`, _el => _el.click());

    await delay(500);
    
    // # RESULTADOS (Exibir Resultados)
    const [link] = await page.$x("//a[contains(., 'Exibir Resultados')]");
    if (link) {
        await link.click();
    }

    await page.waitForNavigation();
    console.log('New Page URL:', page.url());

    await delay(500);

    if( PERIODO == 'anos-finais'){
        /*
        * Anos Finais
        */
        console.log('CLICK ANO FINAIS **');
        await page.$eval("#cssmenu_emec > ul > li > ul > li:nth-child(2) > a", item => item.click());
        
        //await page.waitForNavigation();
        await delay(500);
        console.log('New Page URL:', page.url());
    }else{
        console.log('CLICK ANOS INICIAIS **');
    }

    /* RASPAR DADOS */
    const data = await page.evaluate(() => Array.from(document.querySelectorAll('.PTChildPivotTable table tr td')).map(el => el.innerText)
    );

    //await delay(2500);

    // Dados da tela
    //console.log(data);
    //fs.writeFile('./output.json', JSON.stringify(data), err => err ? console.log(err) : null);

    //await page.screenshot({ path: 'output.png' });
    await browser.close();

    //console.log(data);
    //return data;

    var has_rm = ( data[8] === 'Rede Municipal (RM)') ?  true : false;

    if( has_rm ){
        var info = {
           // 'QUADRODEREFERÊNCIA' :[{
                'Cidade': data[0],
                'Estado': data[1],
                'REDES':[{
                    'Rede': data[8], //'Rede Municipal (RM)'
                    'Escolas': data[9],
                    'Matrículas': data[10]
                },
                {
                    'Rede': data[11], //'Rede Estadual situada no seu município (REM)'
                    'Escolas': data[12],
                    'Matrículas': data[13]
                }],
                'INDICADORES':[]
            //}]
        };
    }else{
        var info = {
            //'QUADRODEREFERÊNCIA' :[{
                'Cidade': data[0],
                'Estado': data[1],
                'REDES':[{
                    'Rede':data[8], //'Rede Estadual situada no seu município (REM)'
                    'Escolas': data[9],
                    'Matrículas': data[10]
                }],
                'INDICADORES':[ ]
            //}]
        };        
    }

    var posini = (has_rm) ? 16 : 13;

    const SECTION = [
        'Matrículas',
        'Total de Estudantes Incluídos',
        'Taxa de Aprovação (%)',
        'Taxa de Abandono (%)',
        'Média Estudantes por Turma',
        'Matrículas em Tempo Integral',
        'Taxa de Reprovação (%)',
        'Taxa de Distorção Idade-série (%)'
    ];

    for(i = posini; i <= data.length; i++){

        var position = (has_rm) ? 24 : 18;

        for( let sect = 0; sect <= SECTION.length; sect ++){            
            if( data[i] == SECTION[sect] && SECTION[sect] !== undefined ){
                let year_start = (PERIODO == 'anos-finais') ? 6 : 1;
                let year_end = (PERIODO == 'anos-finais') ? 9 : 5;
                
                var ind = {
                    "Indicador":data[i],
                    "ANOSESCOLARES":[]
                }

                let len = info.INDICADORES.push(ind);

                for(year = year_start; year <=year_end; year++){
                    
                    if( has_rm ){
                        var indanos = {
                            'AnoEscolar': year,
                            'ANOS':[{
                                'ANO':data[i+3],
                                'RM': data[i+position],
                                'REM': data[i+position+1]
                            },
                            {
                                'ANO':data[i+4],
                                'RM': data[i+position+2],
                                'REM': data[i+position+3]
                            },
                            {
                                'ANO':data[i+5],
                                'RM': data[i+position+4],
                                'REM': data[i+position+5]
                            }]}; 
                        position += 8;          
                    }else{
                        var indanos = {
                            'AnoEscolar': year,
                            'ANOS':[{
                            'ANO':data[i+3],
                            'REM': data[i+position]                                
                            },
                            {
                            'ANO':data[i+4],
                            'REM': data[i+position+1]
                            },
                            {
                            'ANO':data[i+5],
                            'REM': data[i+position+2]
                            } 
                        ]};                        
                        position += 5;
                    }
                    info.INDICADORES[len-1].ANOSESCOLARES.push(indanos);
                }
            }
        }            
    }
    return info;
}