import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularDias,
  calcularMetricasFolga,
  formatISODateLocal,
  gerarMapaCalendarioEPrevisao,
  normalizarRegraEscala,
  parseISODateLocal,
  subtrairUmDiaISO
} from '../js/escalaEngine.js';

test('normalizarRegraEscala usa 10x5 como padrão e aplica mínimo 1 para valores inválidos', () => {
  assert.deepEqual(normalizarRegraEscala({}), {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });
  assert.deepEqual(normalizarRegraEscala({ dias_trabalho: -2, dias_folga: 0 }), {
    diasTrab: 1,
    diasFolg: 1,
    proporcao: 1
  });
  assert.deepEqual(normalizarRegraEscala({ dias_trabalho: 14, dias_folga: 7 }), {
    diasTrab: 14,
    diasFolg: 7,
    proporcao: 0.5
  });
});

test('calcularDias conta de forma inclusiva e subtrairUmDiaISO recua 1 dia', () => {
  assert.equal(calcularDias('2026-11-01', '2026-11-10'), 10);
  assert.equal(calcularDias('2026-11-10', '2026-11-10'), 1);
  assert.equal(subtrairUmDiaISO('2026-11-01'), '2026-10-31');
});

test('calcularMetricasFolga calcula saldo acumulado na escala 10x5', () => {
  const registros = [
    { tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' },
    { tipo: 'Folga', data_inicio: '2026-11-11', data_fim: '2026-11-13' }
  ];

  const metricas = calcularMetricasFolga(registros, {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });

  assert.equal(metricas.diasTrabalhados, 10);
  assert.equal(metricas.folgasGozadas, 3);
  assert.equal(metricas.folgasGeradas, 5);
  assert.equal(metricas.saldo, 2);
});

test('gerarMapaCalendarioEPrevisao projeta início e fim de folga conforme regra e hojeIso', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' }
  ];

  const { mapaDias, previsao } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-08'
  });

  assert.equal(previsao.inicioProximaFolga, '2026-11-09');
  assert.equal(previsao.fimProximaFolga, '2026-11-13');
  assert.equal(previsao.chegouOuPassouPrevisao, false);
  assert.equal(mapaDias['2026-11-09']?.tipo, 'Embarque');
  assert.equal(mapaDias['2026-11-09']?.real, true);
  assert.equal(mapaDias['2026-11-13']?.tipo, 'PrevFolga');
});

test('gerarMapaCalendarioEPrevisao sinaliza aviso pendente quando chega a data da folga sem registro', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' }
  ];

  const { previsao } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-11',
    avisoDispensadoData: null,
    continuaTrabalhandoHoje: null
  });

  assert.equal(previsao.chegouOuPassouPrevisao, true);
});

test('Atestado não entra nos dias trabalhados nem nas folgas usufruídas e marca o dia no calendário', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-05' },
    { id: 2, tipo: 'Atestado', data_inicio: '2026-11-04', data_fim: '2026-11-06', observacao: 'Médico' }
  ];

  const metricas = calcularMetricasFolga(registros, {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });

  assert.equal(metricas.diasTrabalhados, 5);
  assert.equal(metricas.folgasGozadas, 0);
  assert.equal(metricas.folgasGeradas, 2);

  const { mapaDias } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-05'
  });

  assert.equal(mapaDias['2026-11-04']?.temAtestado, true);
  assert.equal(mapaDias['2026-11-06']?.tipo, 'Atestado');
  assert.equal(mapaDias['2026-11-06']?.temAtestado, true);
});

test('continuaTrabalhandoHoje empurra o início da próxima folga para o dia seguinte', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' }
  ];

  const { previsao, mapaDias } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-12',
    avisoDispensadoData: '2026-11-12',
    continuaTrabalhandoHoje: '2026-11-12'
  });

  assert.equal(previsao.inicioProximaFolga, '2026-11-13');
  assert.equal(mapaDias['2026-11-12']?.tipo, 'Embarque');
  assert.equal(mapaDias['2026-11-12']?.real, true);
});

test('calcularMetricasFolga suporta regime 30x15 e saldo negativo quando goza mais folga que o acumulado', () => {
  const registros = [
    { tipo: 'Embarque', data_inicio: '2026-10-01', data_fim: '2026-10-10' },
    { tipo: 'Folga', data_inicio: '2026-10-11', data_fim: '2026-10-16' }
  ];

  const metricas = calcularMetricasFolga(registros, {
    diasTrab: 30,
    diasFolg: 15,
    proporcao: 15 / 30
  });

  assert.equal(metricas.diasTrabalhados, 10);
  assert.equal(metricas.folgasGeradas, 5);
  assert.equal(metricas.folgasGozadas, 6);
  assert.equal(metricas.saldo, -1);
});

test('parseISODateLocal e formatISODateLocal preservam a data sem deslocar por fuso horário', () => {
  const dataObj = parseISODateLocal('2026-11-24');
  assert.equal(formatISODateLocal(dataObj), '2026-11-24');
});

test('Porto também entra como dia trabalhado e gera folga proporcional', () => {
  const registros = [
    { id: 1, tipo: 'Porto', data_inicio: '2026-11-13', data_fim: '2026-11-22' }
  ];

  const metricas = calcularMetricasFolga(registros, {
    diasTrab: 10,
    diasFolg: 5,
    proporcao: 0.5
  });

  assert.equal(metricas.diasTrabalhados, 10);
  assert.equal(metricas.folgasGeradas, 5);
  assert.equal(metricas.saldo, 5);
});

test('gerarMapaCalendarioEPrevisao projeta folga através da virada de mês', () => {
  const registros = [
    { id: 1, tipo: 'Embarque', data_inicio: '2026-11-20', data_fim: '2026-11-29' }
  ];

  const { previsao } = gerarMapaCalendarioEPrevisao({
    registros,
    regraEscala: { diasTrab: 10, diasFolg: 5, proporcao: 0.5 },
    hojeIso: '2026-11-28'
  });

  assert.equal(previsao.inicioProximaFolga, '2026-11-29');
  assert.equal(previsao.fimProximaFolga, '2026-12-03');
});

test('calcularMetricasFolga independe da ordem dos registros no array', () => {
  const ordenados = [
    { tipo: 'Embarque', data_inicio: '2026-11-01', data_fim: '2026-11-10' },
    { tipo: 'Folga', data_inicio: '2026-11-11', data_fim: '2026-11-15' }
  ];
  const embaralhados = [...ordenados].reverse();

  assert.deepEqual(
    calcularMetricasFolga(embaralhados, { diasTrab: 10, diasFolg: 5, proporcao: 0.5 }),
    calcularMetricasFolga(ordenados, { diasTrab: 10, diasFolg: 5, proporcao: 0.5 })
  );
});